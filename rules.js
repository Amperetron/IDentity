/**
 * rules.js - Admission Rules and Compliance Engine for AICTE-APAAR Platform
 * Shared Contract:
 * window.Rules = {
 *   checkAdmission({apaarId, name, collegeId, isNRI, rollNo}) -> {ok, reason},
 *   getCollegeStats() -> [{collegeId, name, state, intake, admitted, nriAdmitted, nriQuota, utilization}]
 * }
 * 
 * Rules:
 * 1. APAAR must exist in Sandbox registry (SEED.apaar).
 * 2. Must not already hold an active admission (anti-seat hoarding).
 * 3. College intake not full.
 * 4. NRI quota not exceeded.
 * 
 * NOTE: All state is strictly derived from the ledger chain, never from separate counters.
 */

(function () {
  'use strict';

  function parseBool(val) {
    if (typeof val === 'boolean') return val;
    if (typeof val === 'number') return val === 1;
    if (typeof val === 'string') {
      const clean = val.trim().toLowerCase();
      return clean === 'true' || clean === 'yes' || clean === '1' || clean === 'y';
    }
    return false;
  }

  /**
   * Scans the Ledger hash chain and derives currently active admissions.
   * Handles ADMISSION (creates record) and CANCELLATION (revokes record).
   * @returns {Map<string, {apaarId: string, name: string, collegeId: string, isNRI: boolean, rollNo: string, blockIndex: number, timestamp: string}>}
   */
  function deriveActiveAdmissionsFromChain() {
    if (!window.Ledger || typeof window.Ledger.getChain !== 'function') {
      return new Map();
    }

    const chain = window.Ledger.getChain();
    const active = new Map();

    for (let i = 0; i < chain.length; i++) {
      const block = chain[i];
      if (!block || !block.type || !block.data) continue;

      if (block.type === 'ADMISSION' && block.data.apaarId) {
        const d = block.data;
        const apaarId = String(d.apaarId).trim();
        active.set(apaarId, {
          apaarId: apaarId,
          name: String(d.name || '').trim(),
          collegeId: String(d.collegeId || '').trim(),
          isNRI: parseBool(d.isNRI),
          rollNo: String(d.rollNo || '').trim(),
          blockIndex: block.index,
          timestamp: block.timestamp
        });
      } else if (block.type === 'CANCELLATION' && block.data.apaarId) {
        const apaarId = String(block.data.apaarId).trim();
        active.delete(apaarId);
      }
    }

    return active;
  }

  const Rules = {
    /**
     * Validates candidate admission against sandbox existence, seat hoarding,
     * college total intake capacity, and NRI quota limit.
     * @param {object} candidate
     * @param {string} candidate.apaarId
     * @param {string} candidate.name
     * @param {string} candidate.collegeId
     * @param {boolean|string} candidate.isNRI
     * @param {string} candidate.rollNo
     * @returns {{ok: boolean, reason: string}}
     */
    checkAdmission({ apaarId, name, collegeId, isNRI, rollNo }) {
      const cleanApaar = String(apaarId || '').trim();
      const cleanCollege = String(collegeId || '').trim();
      const cleanRoll = String(rollNo || '').trim();
      const cleanName = String(name || '').trim();
      const nriFlag = parseBool(isNRI);

      // Basic parameter presence
      if (!cleanApaar) {
        return { ok: false, reason: "Missing APAAR ID" };
      }
      if (!cleanCollege) {
        return { ok: false, reason: "Missing College ID" };
      }
      if (!cleanRoll) {
        return { ok: false, reason: "Missing Roll Number" };
      }

      // Rule 1: APAAR must exist in sandbox registry
      if (!window.SEED || !Array.isArray(window.SEED.apaar)) {
        return { ok: false, reason: "Sandbox registry not available" };
      }
      const student = window.SEED.apaar.find(s => s.apaarId === cleanApaar);
      if (!student) {
        return {
          ok: false,
          reason: `APAAR ID '${cleanApaar}' not found in Sandbox registry`
        };
      }

      // Rule 1b: College must exist in system
      if (!window.SEED.colleges || !Array.isArray(window.SEED.colleges)) {
        return { ok: false, reason: "College master directory not available" };
      }
      const college = window.SEED.colleges.find(
        c => c.id.toLowerCase() === cleanCollege.toLowerCase()
      );
      if (!college) {
        return {
          ok: false,
          reason: `College ID '${cleanCollege}' is not registered under AICTE`
        };
      }

      // Derive all state from the ledger chain
      const activeAdmissions = deriveActiveAdmissionsFromChain();

      // Rule 2: Anti-Seat Hoarding Check
      // Candidate must not already hold an active admission anywhere
      if (activeAdmissions.has(cleanApaar)) {
        const existing = activeAdmissions.get(cleanApaar);
        const existingCollege = window.SEED.colleges.find(
          c => c.id.toLowerCase() === existing.collegeId.toLowerCase()
        );
        const collegeName = existingCollege ? existingCollege.name : existing.collegeId;
        return {
          ok: false,
          reason: `Seat hoarding detected: APAAR ${cleanApaar} already holds active admission at ${collegeName} (Roll No: ${existing.rollNo})`
        };
      }

      // Aggregate counts for the requested college from ledger chain
      let collegeAdmitted = 0;
      let collegeNRIAdmitted = 0;

      for (const [_, adm] of activeAdmissions.entries()) {
        if (adm.collegeId.toLowerCase() === college.id.toLowerCase()) {
          collegeAdmitted++;
          if (adm.isNRI) {
            collegeNRIAdmitted++;
          }
        }
      }

      // Rule 3: College intake capacity check
      if (collegeAdmitted >= college.intake) {
        return {
          ok: false,
          reason: `College intake capacity reached for ${college.name} (${collegeAdmitted}/${college.intake} seats filled)`
        };
      }

      // Rule 4: NRI Quota check
      if (nriFlag && collegeNRIAdmitted >= college.nriQuota) {
        return {
          ok: false,
          reason: `NRI quota exceeded for ${college.name} (${collegeNRIAdmitted}/${college.nriQuota} NRI seats filled)`
        };
      }

      // All rules passed
      return { ok: true, reason: "" };
    },

    /**
     * Derives real-time compliance and capacity stats for all colleges from the ledger chain.
     * @returns {Array<{collegeId: string, name: string, state: string, intake: number, admitted: number, nriAdmitted: number, nriQuota: number, utilization: number}>}
     */
    getCollegeStats() {
      if (!window.SEED || !Array.isArray(window.SEED.colleges)) {
        return [];
      }

      const activeAdmissions = deriveActiveAdmissionsFromChain();
      const counts = {};

      for (const c of window.SEED.colleges) {
        counts[c.id.toLowerCase()] = { admitted: 0, nriAdmitted: 0 };
      }

      for (const [_, adm] of activeAdmissions.entries()) {
        const cKey = adm.collegeId.toLowerCase();
        if (counts[cKey]) {
          counts[cKey].admitted++;
          if (adm.isNRI) {
            counts[cKey].nriAdmitted++;
          }
        }
      }

      return window.SEED.colleges.map(c => {
        const cStat = counts[c.id.toLowerCase()] || { admitted: 0, nriAdmitted: 0 };
        const utilization = c.intake > 0 
          ? Number(((cStat.admitted / c.intake) * 100).toFixed(1)) 
          : 0;

        return {
          collegeId: c.id,
          name: c.name,
          state: c.state,
          intake: c.intake,
          admitted: cStat.admitted,
          nriAdmitted: cStat.nriAdmitted,
          nriQuota: c.nriQuota,
          utilization: utilization
        };
      });
    },

    /**
     * Helper to return all currently active admissions derived from the ledger.
     */
    getActiveAdmissions() {
      return Array.from(deriveActiveAdmissionsFromChain().values());
    },

    /**
     * Helper to parse boolean values
     */
    isNRI: parseBool
  };

  window.Rules = Rules;
})();
