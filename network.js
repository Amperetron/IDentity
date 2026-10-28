/**
 * network.js - Multi-Node Permissioned Network Management & Visualization
 * AICTE APAAR Platform (SIH26263)
 * Role: Agent A
 * 
 * Renders into #tab-network:
 * - Three validator node cards (Validator-MH, Validator-KA, Validator-AICTE) with live head hashes & status
 * - "Tamper Node 2 block #N" button (simulates Byzantine / isolated node corruption)
 * - "Heal node" button (resynchronizes diverged node from the 2/3 majority consensus chain)
 * - Animated "propose -> validate -> sign -> commit" pipeline log for each new block
 * - Multi-node block explorer showing ECDSA P-256 digital signatures and data Merkle roots
 */

(function () {
  'use strict';

  let tamperBlockIndex = 2; // Default block to tamper
  let selectedBlockIndex = 0;

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderNetworkTab() {
    const container = document.getElementById('tab-network');
    if (!container || !window.Ledger) return;

    const nodes = window.Ledger.getNodes();
    const chain = window.Ledger.getChain();
    const globalMerkleRoot = window.Ledger.getMerkleRoot();
    const pipelineLogs = window.Ledger.getPipelineLog();

    const healthyCount = nodes.filter(n => n.status === 'healthy').length;
    const isNetworkConsensus = healthyCount >= 2;
    const isDiverged = healthyCount < nodes.length;
    const divergedNode = nodes.find(n => n.status === 'diverged');

    // Safe bounds for tamper target
    const maxBlockIdx = Math.max(0, chain.length - 1);
    if (tamperBlockIndex > maxBlockIdx) tamperBlockIndex = Math.min(2, maxBlockIdx);

    const html = `
      <div class="gov-card">
        <!-- Header & Top Network Health Indicator -->
        <div class="gov-card-header">
          <div>
            <div class="flex items-center gap-2">
              <h2 class="gov-card-title">Simulated Multi-Node Permissioned Network</h2>
              <span class="badge ${isDiverged ? 'badge-warning' : 'badge-success'} font-mono">
                ${isDiverged ? '⚠️ BYZANTINE FAULT DETECTED' : '● BFT CONSENSUS: 3/3 HEALTHY'}
              </span>
            </div>
            <p class="gov-card-subtitle">
              Simulates 3 independent AICTE validator nodes across state and central authorities.
              Each node maintains its own cryptographic ledger storage in <code>localStorage</code>, 
              validates transaction Merkle trees, and signs blocks using ECDSA P-256 keys (threshold >= 2 of 3).
            </p>
          </div>
          <div class="header-action-pills">
            <span class="badge badge-gov font-mono" title="Global Merkle Root over all block hashes">
              Root: ${globalMerkleRoot.substring(0, 10)}...${globalMerkleRoot.substring(54)}
            </span>
            <span class="badge badge-info">BFT Threshold: 2 of 3</span>
          </div>
        </div>

        <!-- Global Divergence / Consensus Alert Banner -->
        ${isDiverged ? `
          <div class="alert alert-danger mt-4">
            <div class="flex justify-between items-center flex-wrap gap-2">
              <div>
                <div class="font-bold text-sm">⚠️ Node Divergence Detected: ${escapeHtml(divergedNode.name)} Out of Sync!</div>
                <div class="text-xs mt-1">
                  ${escapeHtml(divergedNode.name)} local storage copy differs from the 2/3 majority consensus chain.
                  The Byzantine fault tolerant network continues functioning because 2 of 3 validator signatures are satisfied.
                </div>
              </div>
              <button class="btn btn-sm btn-success" id="btn-quick-heal">
                🩺 Heal &amp; Resync Node from Majority
              </button>
            </div>
          </div>
        ` : `
          <div class="alert alert-success mt-4">
            <div class="font-bold text-sm">✓ All Validator Nodes in Consensus (3 of 3 Active)</div>
            <div class="text-xs mt-1">
              Every validator maintains identical ledger heights and cryptographic head hashes.
              Majority consensus chain is verified with digital signatures and Merkle integrity.
            </div>
          </div>
        `}

        <!-- 3 Validator Nodes Cards Grid -->
        <div class="network-nodes-grid mt-6">
          ${nodes.map((node, idx) => {
            const isNodeDiverged = node.status === 'diverged';
            const nodeProposerRound = (chain.length % nodes.length) === idx;
            return `
              <div class="node-card ${isNodeDiverged ? 'node-card-diverged' : 'node-card-healthy'}">
                <div class="node-card-top">
                  <div class="node-id-badge">
                    <span class="node-status-dot ${isNodeDiverged ? 'dot-red-pulse' : 'dot-green'}"></span>
                    <strong class="text-base text-gov-navy">${escapeHtml(node.name)}</strong>
                  </div>
                  <span class="badge ${isNodeDiverged ? 'badge-danger' : 'badge-success'} font-mono">
                    ${isNodeDiverged ? 'DIVERGED' : 'HEALTHY'}
                  </span>
                </div>

                <div class="node-region text-xs text-gov-muted mt-1">
                  📍 ${escapeHtml(node.region)}
                </div>

                <div class="node-stats mt-3">
                  <div class="node-stat-item">
                    <span class="stat-lbl">Block Height</span>
                    <span class="stat-val font-mono font-bold">${node.height}</span>
                  </div>
                  <div class="node-stat-item">
                    <span class="stat-lbl">Consensus Role</span>
                    <span class="stat-val text-xs ${nodeProposerRound ? 'text-blue-700 font-bold' : ''}">
                      ${nodeProposerRound ? '★ Next Proposer' : 'Validator'}
                    </span>
                  </div>
                </div>

                <div class="node-hash-box mt-3">
                  <div class="text-xs font-semibold text-gov-muted">Head Block Hash:</div>
                  <div class="font-mono text-xs text-gov-navy break-all bg-gray-50 p-1.5 rounded mt-0.5 border">
                    ${node.headHash || '(genesis)'}
                  </div>
                </div>

                <div class="node-key-info mt-2">
                  <span class="text-xs text-gov-muted">ECDSA Key:</span>
                  <span class="font-mono text-xs text-gray-700">P-256 (${node.keyFingerprint})</span>
                </div>

                <div class="node-actions mt-3 pt-2 border-t flex gap-2">
                  <button class="btn btn-xs ${isNodeDiverged ? 'btn-success' : 'btn-outline'} btn-node-action" 
                    data-action="${isNodeDiverged ? 'heal' : 'tamper'}" 
                    data-node="${node.id}">
                    ${isNodeDiverged ? '🩺 Resync Node' : '⚡ Tamper This Node'}
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <!-- Interactive Network Actions Bar -->
        <div class="network-actions-toolbar mt-6">
          <div class="toolbar-group">
            <span class="text-xs font-bold uppercase text-gov-navy">Network Fault Simulation:</span>
            <div class="flex items-center gap-2 flex-wrap">
              <div class="flex items-center gap-1">
                <label class="text-xs text-gov-muted font-medium">Target Block #:</label>
                <input type="number" id="input-tamper-idx" class="form-input-sm font-mono" min="0" max="${maxBlockIdx}" value="${tamperBlockIndex}" style="width: 60px;" />
              </div>
              <button class="btn btn-warning btn-sm" id="btn-tamper-node2">
                ⚡ Tamper Node 2 Block #${tamperBlockIndex}
              </button>
              <button class="btn btn-success btn-sm" id="btn-heal-node">
                🩺 Heal Node (Majority Resync)
              </button>
              <button class="btn btn-primary btn-sm" id="btn-propose-sample">
                ➕ Propose Sample Block
              </button>
            </div>
          </div>

          <div class="toolbar-group text-right">
            <span class="text-xs text-gov-muted">Consensus Mechanism:</span>
            <span class="badge badge-light font-mono">Round-Robin BFT (2/3)</span>
          </div>
        </div>

        <!-- Animated Propose -> Validate -> Sign -> Commit Pipeline -->
        <div class="consensus-pipeline-card mt-6">
          <div class="pipeline-header">
            <div class="flex items-center gap-2">
              <span class="pipeline-pulse"></span>
              <h3 class="text-base font-bold text-gov-navy">Live Consensus Engine (Propose &rarr; Validate &rarr; Sign &rarr; Commit)</h3>
            </div>
            <span class="text-xs text-gov-muted">Real-time asynchronous BFT threshold pipeline</span>
          </div>

          <!-- Step Progress Visualizer -->
          <div class="pipeline-steps-bar mt-3">
            <div class="pipeline-step-node step-complete">
              <div class="step-num">1</div>
              <div class="step-label">
                <strong>PROPOSE</strong>
                <span class="text-xs text-gray-500">Round-Robin Node</span>
              </div>
            </div>
            <div class="pipeline-arrow">&rarr;</div>
            <div class="pipeline-step-node step-complete">
              <div class="step-num">2</div>
              <div class="step-label">
                <strong>VALIDATE</strong>
                <span class="text-xs text-gray-500">Merkle &amp; Hash Check</span>
              </div>
            </div>
            <div class="pipeline-arrow">&rarr;</div>
            <div class="pipeline-step-node step-complete">
              <div class="step-num">3</div>
              <div class="step-label">
                <strong>SIGN</strong>
                <span class="text-xs text-gray-500">ECDSA P-256 (&ge;2/3)</span>
              </div>
            </div>
            <div class="pipeline-arrow">&rarr;</div>
            <div class="pipeline-step-node step-complete">
              <div class="step-num">4</div>
              <div class="step-label">
                <strong>COMMIT</strong>
                <span class="text-xs text-gray-500">Append to Nodes</span>
              </div>
            </div>
          </div>

          <!-- Consensus Audit Log Stream -->
          <div class="pipeline-log-stream mt-4">
            <div class="text-xs font-bold uppercase text-gov-muted mb-2">Recent Consensus Commit Logs:</div>
            ${pipelineLogs.length === 0 ? `
              <div class="text-xs text-gray-500 italic py-2">
                Genesis block verified by all 3 nodes. New blocks will log consensus pipeline stages here.
              </div>
            ` : `
              <div class="log-entries-scroll">
                ${pipelineLogs.map(log => `
                  <div class="pipeline-log-entry">
                    <span class="log-time font-mono text-xs">${new Date(log.timestamp).toLocaleTimeString()}</span>
                    <span class="badge ${getBlockTypeBadge(log.blockType)} font-mono text-xs">#${log.blockIndex} ${log.blockType}</span>
                    <span class="log-proposer text-xs">Proposer: <strong>${escapeHtml(log.proposer)}</strong></span>
                    <span class="log-merkle text-xs font-mono" title="Block Data Merkle Root">Root: ${log.merkleRoot.substring(0, 8)}...</span>
                    <span class="log-signers text-xs">
                      Signatures: <span class="badge badge-success text-xs">${log.signaturesCount}/3</span>
                      (${log.signers.join(', ')})
                    </span>
                    <span class="log-commit text-xs text-green-700 font-semibold">✓ Committed</span>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
        </div>

        <!-- Multi-Node Block Explorer with Signatures & Merkle Roots -->
        <div class="multi-node-explorer mt-6">
          <div class="explorer-header flex justify-between items-center flex-wrap gap-2">
            <div>
              <h3 class="text-base font-bold text-gov-navy">Consensus Block Explorer</h3>
              <p class="text-xs text-gov-muted">Inspect Merkle roots, validator signatures, and payloads on the majority chain.</p>
            </div>
            <span class="badge badge-gov font-mono">Blocks on Consensus Chain: ${chain.length}</span>
          </div>

          <div class="blocks-container mt-4">
            ${chain.map((blk) => {
              const signers = (blk.signatures || []).map(s => s.nodeName || s.nodeId).join(', ');
              const hasMerkle = !!blk.merkleRoot;
              return `
                <div class="block-card">
                  <div class="block-header">
                    <div class="block-title">
                      <span class="block-index">#${blk.index}</span>
                      <span class="badge ${getBlockTypeBadge(blk.type)}">${blk.type}</span>
                      <span class="badge badge-light font-mono text-xs">
                        Proposer: ${blk.proposer ? escapeHtml(blk.proposer.name || blk.proposer.id) : 'Genesis'}
                      </span>
                    </div>
                    <div class="block-meta">
                      <span class="text-xs text-gov-muted">${new Date(blk.timestamp).toLocaleString()}</span>
                    </div>
                  </div>

                  <!-- Merkle Root & Hashes -->
                  <div class="block-hashes mt-3">
                    <div class="hash-row">
                      <span class="hash-label">Merkle Root:</span>
                      <span class="hash-value font-mono text-blue-700 font-semibold" title="Merkle root of block data items">
                        🌿 ${blk.merkleRoot || '(none)'}
                      </span>
                    </div>
                    <div class="hash-row mt-1">
                      <span class="hash-label">Prev Hash:</span>
                      <span class="hash-value font-mono">${blk.prevHash}</span>
                    </div>
                    <div class="hash-row mt-1">
                      <span class="hash-label">Block Hash:</span>
                      <span class="hash-value font-mono font-bold text-gov-navy">${blk.hash}</span>
                    </div>
                  </div>

                  <!-- Digital Signatures Section -->
                  <div class="signatures-box mt-3 pt-2 border-t">
                    <div class="flex items-center justify-between">
                      <span class="text-xs font-bold text-gov-navy">
                        🔑 Validator Signatures (ECDSA P-256):
                      </span>
                      <span class="badge badge-success text-xs font-mono">
                        ${(blk.signatures || []).length} / 3 Signatures Verified
                      </span>
                    </div>
                    <div class="signatures-list mt-2 flex flex-wrap gap-2">
                      ${(blk.signatures || []).map(sig => `
                        <div class="signature-chip">
                          <span class="sig-node-name">✓ ${escapeHtml(sig.nodeName || sig.nodeId)}:</span>
                          <span class="sig-hex font-mono text-xs" title="${sig.signature}">
                            ${sig.signature.substring(0, 16)}...
                          </span>
                        </div>
                      `).join('')}
                    </div>
                  </div>

                  <!-- Payload Details -->
                  <div class="block-payload mt-3">
                    <div class="payload-label">Data Items Payload:</div>
                    <pre class="payload-code">${escapeHtml(JSON.stringify(blk.data, null, 2))}</pre>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;

    // Attach Event Handlers
    attachEventHandlers(container, maxBlockIdx);
  }

  function getBlockTypeBadge(type) {
    switch (type) {
      case 'GENESIS': return 'badge-gov';
      case 'ADMISSION': return 'badge-primary';
      case 'CANCELLATION': return 'badge-danger';
      case 'CERTIFICATE': return 'badge-success';
      case 'FLAG': return 'badge-warning';
      default: return 'badge-light';
    }
  }

  function attachEventHandlers(container, maxBlockIdx) {
    if (!container || typeof container.querySelector !== 'function') return;
    const inputIdx = container.querySelector('#input-tamper-idx');
    if (inputIdx) {
      inputIdx.addEventListener('change', (e) => {
        let val = parseInt(e.target.value, 10);
        if (isNaN(val) || val < 0) val = 0;
        if (val > maxBlockIdx) val = maxBlockIdx;
        tamperBlockIndex = val;
        e.target.value = val;
      });
    }

    const btnTamperNode2 = container.querySelector('#btn-tamper-node2');
    if (btnTamperNode2) {
      btnTamperNode2.addEventListener('click', () => {
        const val = inputIdx ? parseInt(inputIdx.value, 10) : tamperBlockIndex;
        window.Ledger.tamper(val, 'node-ka');
        renderNetworkTab();
      });
    }

    const btnHealNode = container.querySelector('#btn-heal-node');
    if (btnHealNode) {
      btnHealNode.addEventListener('click', () => {
        window.Ledger.heal();
        renderNetworkTab();
      });
    }

    const btnQuickHeal = container.querySelector('#btn-quick-heal');
    if (btnQuickHeal) {
      btnQuickHeal.addEventListener('click', () => {
        window.Ledger.heal();
        renderNetworkTab();
      });
    }

    const btnPropose = container.querySelector('#btn-propose-sample');
    if (btnPropose) {
      btnPropose.addEventListener('click', async () => {
        btnPropose.disabled = true;
        btnPropose.innerText = "Proposing...";
        try {
          const randId = Math.floor(1000 + Math.random() * 9000);
          await window.Ledger.addBlock("FLAG", {
            collegeId: "TS-CBIT-01",
            severity: "low",
            reason: `Automated Network Health Pulse #${randId}`,
            details: { testTimestamp: new Date().toISOString() }
          });
          renderNetworkTab();
        } catch (e) {
          alert("Block proposal error: " + e.message);
        } finally {
          btnPropose.disabled = false;
          btnPropose.innerText = "➕ Propose Sample Block";
        }
      });
    }

    // Individual node action buttons
    const nodeActionBtns = container.querySelectorAll('.btn-node-action');
    nodeActionBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.getAttribute('data-action');
        const nodeId = btn.getAttribute('data-node');
        if (action === 'heal') {
          window.Ledger.heal(nodeId);
        } else {
          window.Ledger.tamper(tamperBlockIndex, nodeId);
        }
        renderNetworkTab();
      });
    });
  }

  const Network = {
    init() {
      renderNetworkTab();

      // Listen for network and ledger updates
      if (typeof window !== 'undefined') {
        window.addEventListener('ledger:updated', () => {
          const tab = document.getElementById('tab-network');
          if (tab && tab.classList.contains('active')) {
            renderNetworkTab();
          }
        });

        window.addEventListener('network:pipeline', () => {
          const tab = document.getElementById('tab-network');
          if (tab && tab.classList.contains('active')) {
            renderNetworkTab();
          }
        });

        window.addEventListener('network:divergence', () => {
          renderNetworkTab();
        });

        window.addEventListener('network:healed', () => {
          renderNetworkTab();
        });

        // Also re-render whenever the tab is selected
        const tabBtn = document.querySelector('[data-tab="tab-network"]');
        if (tabBtn) {
          tabBtn.addEventListener('click', () => {
            setTimeout(renderNetworkTab, 50);
          });
        }
      }
    },

    render: renderNetworkTab
  };

  window.Network = Network;

  // Auto-init on DOM readiness
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Network.init());
  } else {
    setTimeout(() => Network.init(), 100);
  }
})();
