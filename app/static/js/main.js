// static/main.js
// Handles all frontend logic for index.html, fetching data from the backend via a JSON endpoint.

document.addEventListener("DOMContentLoaded", function () {
  // Elements
  const claimBtn = document.getElementById("claim-btn");
  const claimMultiBtn = document.getElementById("claim-multi-btn");
  const checkRcBtn = document.getElementById("check-rc-btn");
  const usernameInput = document.getElementById("claim-username");
  const countInput = document.getElementById("claim-multi-count");
  let lastRcCheck = null;
  let rcSufficient = false;
  function updateClaimButtons() {
    claimBtn.disabled = !rcSufficient;
    claimMultiBtn.disabled = !rcSufficient;
  }

  // --- Hive Keychain Claim Handlers ---
  function showStatus(msg, type = "info") {
    const el = document.getElementById("claim-status");
    el.innerHTML = `<div class="alert alert-${type} py-2 mb-0">${msg}</div>`;
  }

  window.claimInProgress = window.claimInProgress || false;
  function handleClaim(single = true) {
    if (claimInProgress) return;
    if (!window.hive_keychain) {
      showStatus(
        "Hive Keychain is not installed or not enabled in your browser.",
        "danger",
      );
      return;
    }
    const username = usernameInput.value.trim();
    if (!username) {
      showStatus("Please enter your Hive username.", "warning");
      return;
    }
    const op = [
      "claim_account",
      { creator: username, fee: "0.000 HIVE", extensions: [] },
    ];
    let ops = single ? [op] : [];
    const claimCount = single ? 1 : parseInt(countInput.value) || 2;
    if (!single) {
      for (let i = 0; i < claimCount; i++) ops.push(op);
    }
    showStatus("Requesting signature from Hive Keychain...", "info");
    claimInProgress = true;
    // Store the RC before claiming to calculate the difference later
    let rcBefore = lastRcCheck;
    let estimatedCost = 0;
    let totalClaimCount = claimCount;

    // Get the most recent estimated cost before claiming
    fetch("/api/rc_cost_data?hours=720")
      .then((r) => r.json())
      .then((rcData) => {
        estimatedCost = rcData.most_recent_cost || 0;

        // Proceed with the claim operation
        window.hive_keychain.requestBroadcast(
          username,
          ops,
          "Active",
          function (response) {
            claimInProgress = false;
            if (response.success) {
              showStatus(
                "Claim broadcast sent! Checking RC usage...",
                "success",
              );

              // Wait a moment for the blockchain to process the transaction
              setTimeout(() => {
                // Check RC after the claim
                fetch(`/api/rc/${encodeURIComponent(username)}`)
                  .then((response) => response.json())
                  .then((data) => {
                    if (
                      data.success &&
                      data.rc &&
                      typeof data.rc.current_mana === "number"
                    ) {
                      const rcAfter = data.rc.current_mana;
                      const rcUsed = rcBefore - rcAfter;
                      // Scale the estimated cost based on the number of claims
                      const totalEstimatedCost =
                        estimatedCost * totalClaimCount;
                      // Use more precise calculation for large numbers
                      const percentDiff =
                        totalEstimatedCost > 0
                          ? parseFloat(
                              ((rcUsed / totalEstimatedCost) * 100).toFixed(2),
                            )
                          : 0;

                      // Update the last RC check value
                      lastRcCheck = rcAfter;

                      // Update UI with RC usage information
                      showStatus(
                        `Claim successful! Check the RC usage details below.`,
                        "success",
                      );

                      // Display detailed RC usage comparison in the dedicated section
                      const rcComparisonEl = document.getElementById(
                        "rc-usage-comparison",
                      );
                      rcComparisonEl.innerHTML = `
                                              <div class="card border-info shadow-sm rounded">
                                                <div class="card-body p-3">
                                                  <h6 class="card-title mb-2">RC Usage Details</h6>
                                                  <div class="d-flex justify-content-between mb-1">
                                                    <span>RC Before Claim:</span>
                                                    <span class="fw-bold">${rcBefore.toLocaleString()}</span>
                                                  </div>
                                                  <div class="d-flex justify-content-between mb-1">
                                                    <span>RC After Claim:</span>
                                                    <span class="fw-bold">${rcAfter.toLocaleString()}</span>
                                                  </div>
                                                  <div class="d-flex justify-content-between mb-1">
                                                    <span>Actual RC Used:</span>
                                                    <span class="fw-bold text-primary">${rcUsed.toLocaleString()}</span>
                                                  </div>
                                                  <div class="d-flex justify-content-between mb-1">
                                                    <span>Estimated RC Cost (${totalClaimCount} claim${totalClaimCount > 1 ? "s" : ""}):</span>
                                                    <span class="fw-bold">${totalEstimatedCost.toLocaleString()}</span>
                                                  </div>
                                                  <div class="progress mt-2" title="Actual vs Estimated">
                                                    <div class="progress-bar bg-success" role="progressbar" style="width: ${Math.min(percentDiff, 100)}%" aria-valuenow="${percentDiff}" aria-valuemin="0" aria-valuemax="100">${percentDiff}%</div>
                                                  </div>
                                                  <div class="text-center small text-muted mt-1">Actual RC used is ${percentDiff}% of estimated cost</div>
                                                </div>
                                              </div>
                                            `;

                      // Update the RC bar
                      const maxRc = data.rc.max_mana;
                      const percent = Math.round((100 * rcAfter) / maxRc);
                      document.getElementById("rc-bar").innerHTML = `
                                              <div class='progress' title='${rcAfter.toLocaleString()} / ${maxRc.toLocaleString()}'>
                                                <div class='progress-bar bg-info' role='progressbar' style='width: ${percent}%' aria-valuenow='${percent}' aria-valuemin='0' aria-valuemax='100'>${percent}%</div>
                                              </div>
                                              <div class='text-center small text-muted mt-1'>${rcAfter.toLocaleString()} / ${maxRc.toLocaleString()} RC</div>
                                            `;

                      // Update claim buttons based on new RC value
                      if (estimatedCost > 0) {
                        rcSufficient = rcAfter >= estimatedCost;
                        updateClaimButtons();
                      }
                    } else {
                      showStatus(
                        "Claim successful! Could not check updated RC: " +
                          (data.message || "Unknown error"),
                        "success",
                      );
                    }
                  })
                  .catch((err) => {
                    showStatus(
                      "Claim successful! Error checking updated RC: " + err,
                      "success",
                    );
                  });
              }, 3000); // Wait 3 seconds for blockchain to process
            } else {
              showStatus(
                "Keychain error: " + (response.message || "Unknown error"),
                "danger",
              );
            }
          },
        );
      })
      .catch((err) => {
        // If we can't get the estimated cost, proceed with the claim anyway
        window.hive_keychain.requestBroadcast(
          username,
          ops,
          "Active",
          function (response) {
            claimInProgress = false;
            if (response.success) {
              showStatus(
                "Claim broadcast sent! Check Hive Engine for account credit.",
                "success",
              );
            } else {
              showStatus(
                "Keychain error: " + (response.message || "Unknown error"),
                "danger",
              );
            }
          },
        );
      });
  }

  checkRcBtn.addEventListener("click", function () {
    const username = usernameInput.value.trim();
    if (!username) {
      showStatus("Please enter your Hive username to check RC.", "warning");
      document.getElementById("rc-bar").innerHTML = "";
      document.getElementById("rc-usage-comparison").innerHTML = "";
      return;
    }
    showStatus("Checking RC for " + username + "...", "info");
    fetch(`/api/rc/${encodeURIComponent(username)}`)
      .then((response) => response.json())
      .then((data) => {
        if (
          data.success &&
          data.rc &&
          typeof data.rc.current_mana === "number" &&
          typeof data.rc.max_mana === "number"
        ) {
          lastRcCheck = data.rc.current_mana;
          const maxRc = data.rc.max_mana;
          const percent = Math.round((100 * lastRcCheck) / maxRc);

          // Fetch RC cost data to calculate max claims
          fetch("/api/rc_cost_data?hours=720")
            .then((r) => r.json())
            .then((rcData) => {
              const mostRecentCost = rcData.most_recent_cost || 0;
              let maxClaims = 0;

              if (mostRecentCost > 0) {
                maxClaims = Math.floor(lastRcCheck / mostRecentCost);
              }

              // Set max attribute and handle user input
              countInput.max = maxClaims > 0 ? maxClaims : 1;

              if (maxClaims > 0) {
                rcSufficient = true;
                // Always set the value to maxClaims when checking RC
                countInput.value = maxClaims;
                countInput.title = `You can claim up to ${maxClaims} account(s) with your RC.`;
              } else {
                countInput.value = 1;
                rcSufficient = false;
                countInput.title =
                  "Not enough RC to claim more than 1 account.";
              }
              updateClaimButtons();

              // Render progress bar
              document.getElementById("rc-bar").innerHTML = `
                                <div class='progress' title='${lastRcCheck.toLocaleString()} / ${maxRc.toLocaleString()}'>
                                    <div class='progress-bar bg-info' role='progressbar' style='width: ${percent}%' aria-valuenow='${percent}' aria-valuemin='0' aria-valuemax='100'>${percent}%</div>
                                </div>
                                <div class='text-center small text-muted mt-1'>${lastRcCheck.toLocaleString()} / ${maxRc.toLocaleString()} RC</div>
                            `;

              // Handle claims message
              let claimsMsg = "";
              if (typeof data.claims === "number") {
                claimsMsg = `<br><span class='rc-teal'>You already have <b>${data.claims}</b> claimed account${data.claims === 1 ? "" : "s"} ready to use.</span>`;
              }

              // Show appropriate status message
              if (maxClaims > 0) {
                showStatus(
                  "You have enough RC (" +
                    lastRcCheck.toLocaleString() +
                    ") to claim " +
                    maxClaims +
                    " account(s)!" +
                    claimsMsg,
                  "success",
                );
              } else {
                showStatus(
                  "Not enough RC. You have " +
                    lastRcCheck.toLocaleString() +
                    ", need " +
                    (mostRecentCost || 0).toLocaleString() +
                    " to claim 1 account." +
                    claimsMsg,
                  "danger",
                );
              }
            })
            .catch((err) => {
              showStatus("Error fetching RC cost data: " + err, "danger");
              document.getElementById("rc-bar").innerHTML = "";
            });
        } else {
          showStatus(
            "Could not check RC: " + (data.message || "Unknown error"),
            "danger",
          );
          document.getElementById("rc-bar").innerHTML = "";
        }
      })
      .catch((err) => {
        showStatus("Error checking RC: " + err, "danger");
        document.getElementById("rc-bar").innerHTML = "";
      });
  });
  countInput.addEventListener("input", function () {
    // Don't disable buttons when user changes the number manually
    // Just validate that the input is within valid range (1 to max)
    const currentValue = parseInt(countInput.value) || 0;
    const maxValue = parseInt(countInput.max) || 1;

    // RC is sufficient as long as we have a valid number within range
    rcSufficient =
      currentValue >= 1 && currentValue <= maxValue && lastRcCheck !== null;
    updateClaimButtons();
  });
  usernameInput.addEventListener("input", function () {
    rcSufficient = false;
    updateClaimButtons();
  });
  claimBtn.addEventListener("click", function () {
    handleClaim(true);
  });
  claimMultiBtn.addEventListener("click", function () {
    handleClaim(false);
  });

  // Update the most recent estimated RC claim cost display
  function updateRecentCostDisplay() {
    fetch("/api/rc_cost_data?hours=720")
      .then((response) => response.json())
      .then((data) => {
        // Update the most recent cost/time display
        const costEl = document.getElementById("most-recent-cost");
        const timeEl = document.getElementById("most-recent-time");
        if (
          data.most_recent_cost !== undefined &&
          data.most_recent_cost !== null
        ) {
          costEl.textContent = Number(data.most_recent_cost).toLocaleString();
        } else {
          costEl.textContent = "No data available";
        }
        if (data.most_recent_time) {
          // Format ISO string to readable local time
          const d = new Date(data.most_recent_time);
          if (!isNaN(d)) {
            timeEl.textContent = "as of " + d.toLocaleString();
          } else {
            timeEl.textContent = "as of " + data.most_recent_time;
          }
        } else {
          timeEl.textContent = "";
        }
      })
      .catch((err) => {
        console.error("Error fetching recent RC cost data:", err);
      });
  }
  
  // Initial load of recent cost display
  updateRecentCostDisplay();
});
