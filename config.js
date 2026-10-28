/**
 * config.js - Global Platform Configuration
 * Agent B - Shared Contract: window.CONFIG
 *
 * Provides runtime parameters for:
 * 1. Ethereum Sepolia Testnet State Anchoring (window.Anchor)
 * 2. Natural Language Query LLM Proxy (window.NLQuery)
 */

(function () {
  'use strict';

  const DEFAULT_CONTRACT_ADDRESS = "0xce8105B796E2D02B040AC677dD41826608cf00dd";
  const DEFAULT_CHAIN_ID = 11155111;
  const DEFAULT_EXPLORER = "https://sepolia.etherscan.io";
  const DEFAULT_LLM_PROXY_URL = "/api/query";
  const DEFAULT_SUPABASE_URL = "https://xdcmxufmujhwahojwokb.supabase.co";
  const DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_-FGTwYaHpnP32XvcQUYBdw_kRpTu8vE";
  const DEFAULT_ROOM = "public-demo";

  // Read persisted user overrides from localStorage if present
  let overrides = {};
  try {
    const raw = localStorage.getItem('aicte_apaar_config');
    if (raw) {
      overrides = JSON.parse(raw);
    }
  } catch (e) {
    // Graceful fallback if localStorage is unavailable
  }

  // Ignore an empty-string CONTRACT_ADDRESS saved in localStorage key 'aicte_apaar_config' and fall back to default
  let initialContractAddress = DEFAULT_CONTRACT_ADDRESS;
  if (typeof overrides.CONTRACT_ADDRESS === 'string' && overrides.CONTRACT_ADDRESS.trim().length > 0) {
    initialContractAddress = overrides.CONTRACT_ADDRESS.trim();
  }

  // Fall back to default LLM_PROXY_URL if empty
  let initialLlmProxyUrl = DEFAULT_LLM_PROXY_URL;
  if (typeof overrides.LLM_PROXY_URL === 'string' && overrides.LLM_PROXY_URL.trim().length > 0) {
    initialLlmProxyUrl = overrides.LLM_PROXY_URL.trim();
  }

  // Base configuration complying with shared contract
  const CONFIG = {
    CONTRACT_ADDRESS: initialContractAddress,
    CHAIN_ID: typeof overrides.CHAIN_ID === 'number' ? overrides.CHAIN_ID : DEFAULT_CHAIN_ID,
    EXPLORER: typeof overrides.EXPLORER === 'string' && overrides.EXPLORER ? overrides.EXPLORER : DEFAULT_EXPLORER,
    LLM_PROXY_URL: initialLlmProxyUrl,
    SUPABASE_URL: typeof overrides.SUPABASE_URL === 'string' && overrides.SUPABASE_URL ? overrides.SUPABASE_URL : DEFAULT_SUPABASE_URL,
    SUPABASE_ANON_KEY: typeof overrides.SUPABASE_ANON_KEY === 'string' && overrides.SUPABASE_ANON_KEY ? overrides.SUPABASE_ANON_KEY : DEFAULT_SUPABASE_ANON_KEY,
    ROOM: typeof overrides.ROOM === 'string' && overrides.ROOM ? overrides.ROOM : DEFAULT_ROOM,

    /**
     * Helper to update and persist configuration
     * @param {Object} newSettings
     */
    save(newSettings) {
      if (!newSettings || typeof newSettings !== 'object') return;
      if (newSettings.CONTRACT_ADDRESS !== undefined) {
        const trimmed = String(newSettings.CONTRACT_ADDRESS).trim();
        this.CONTRACT_ADDRESS = trimmed.length > 0 ? trimmed : DEFAULT_CONTRACT_ADDRESS;
      }
      if (newSettings.CHAIN_ID !== undefined) this.CHAIN_ID = Number(newSettings.CHAIN_ID);
      if (newSettings.EXPLORER !== undefined) this.EXPLORER = String(newSettings.EXPLORER).trim();
      if (newSettings.LLM_PROXY_URL !== undefined) this.LLM_PROXY_URL = String(newSettings.LLM_PROXY_URL).trim();
      if (newSettings.SUPABASE_URL !== undefined) this.SUPABASE_URL = String(newSettings.SUPABASE_URL).trim();
      if (newSettings.SUPABASE_ANON_KEY !== undefined) this.SUPABASE_ANON_KEY = String(newSettings.SUPABASE_ANON_KEY).trim();
      if (newSettings.ROOM !== undefined) this.ROOM = String(newSettings.ROOM).trim();

      try {
        localStorage.setItem('aicte_apaar_config', JSON.stringify({
          CONTRACT_ADDRESS: this.CONTRACT_ADDRESS,
          CHAIN_ID: this.CHAIN_ID,
          EXPLORER: this.EXPLORER,
          LLM_PROXY_URL: this.LLM_PROXY_URL,
          SUPABASE_URL: this.SUPABASE_URL,
          SUPABASE_ANON_KEY: this.SUPABASE_ANON_KEY,
          ROOM: this.ROOM
        }));
      } catch (e) {
        console.warn('Unable to persist config to localStorage:', e);
      }

      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('config:updated', { detail: this }));
      }
    }
  };

  // Export to window
  window.CONFIG = CONFIG;
})();
