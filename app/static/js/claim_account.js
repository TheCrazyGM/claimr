// claim_account.js – frontend logic for the Claim Account page
// Requires dhive loaded globally and optional Hive Keychain extension.

(function () {
  const $ = (sel) => document.querySelector(sel);

  // Elements
  const claimerInput = $("#claimer-username");
  const checkClaimerBtn = $("#check-claimer-btn");
  const claimerStatus = $("#claimer-status");

  const newUserInput = $("#new-username");
  const checkNewuserBtn = $("#check-newuser-btn");
  const newuserStatus = $("#newuser-status");

  const passwordSection = $("#password-section");
  const passwordInput = $("#password");
  const regenPassBtn = $("#regen-pass-btn");

  const keysSection = $("#keys-section");
  const keysDisplay = $("#keys-display");
  const downloadKeysBtn = $("#download-keys-btn");

  const submitSection = $("#submit-section");
  const createBtn = $("#create-account-btn");

  let generatedKeys = null;
  const client = new dhive.Client(["https://api.hive.blog"]);

  // Toast helper using Bootstrap 5
  function showToast(message, type = "info", duration = 7000) {
    const container = document.getElementById("toastContainer");
    if (!container || typeof bootstrap === "undefined") return;
    const toastEl = document.createElement("div");
    toastEl.className = `toast align-items-center text-bg-${type} border-0`;
    toastEl.setAttribute("role", "alert");
    toastEl.setAttribute("aria-live", "assertive");
    toastEl.setAttribute("aria-atomic", "true");
    toastEl.innerHTML = `
      <div class="d-flex">
        <div class="toast-body">${message}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>`;
    container.appendChild(toastEl);
    const bsToast = new bootstrap.Toast(toastEl, { delay: duration });
    bsToast.show();
    toastEl.addEventListener("hidden.bs.toast", () => toastEl.remove());
  }

  function showStatus(el, msg, type = "info") {
    const icon =
      type === "success"
        ? "bi-check-circle-fill"
        : type === "danger"
          ? "bi-x-circle-fill"
          : "bi-info-circle";
    el.innerHTML = `<div class="alert alert-${type} py-2 mb-0"><i class="bi ${icon} me-1"></i>${msg}</div>`;
  }

  // Track validation status
  let claimerValid = false;
  let newUsernameValid = false;
  
  // Check if both validations are complete and proceed if so
  function checkBothValidations() {
    if (claimerValid && newUsernameValid) {
      // Both checks passed, lock inputs to prevent changes before submission
      claimerInput.disabled = true;
      checkClaimerBtn.disabled = true;
      newUserInput.disabled = true;
      checkNewuserBtn.disabled = true;
      
      // Proceed to password section
      passwordSection.style.display = "";
      generatePassword();
    }
  }

  // Check RC + claims for existing user
  async function handleCheckClaimer() {
    const username = claimerInput.value.trim().toLowerCase();
    if (!username) {
      showStatus(claimerStatus, "Enter your username", "warning");
      claimerValid = false;
      return;
    }
    showStatus(claimerStatus, "Checking RC and pending claims…");
    try {
      const res = await fetch(`/api/rc/${encodeURIComponent(username)}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Error");
      const claims = data.claims || 0;
      if (claims < 1) {
        showStatus(
          claimerStatus,
          `You have no pending claimed accounts.`,
          "danger",
        );
        claimerValid = false;
        return;
      }
      showStatus(
        claimerStatus,
        `You have ${claims} pending claimed accounts!`,
        "success",
      );
      // Mark claimer as valid
      claimerValid = true;
      // Lock this input after successful validation
      claimerInput.disabled = true;
      checkClaimerBtn.disabled = true;
      // Always enable new-account inputs if not already validated
      newUserInput.disabled = false;
      checkNewuserBtn.disabled = false;
      // Check if we can proceed
      checkBothValidations();
    } catch (err) {
      showStatus(claimerStatus, err.message || err, "danger");
      claimerValid = false;
    }
  }

  // Check if desired new username is free
  async function handleCheckNewUser() {
    const name = newUserInput.value.trim().toLowerCase();
    if (!name) {
      showStatus(newuserStatus, "Enter desired account name", "warning");
      newUsernameValid = false;
      return;
    }
    showStatus(newuserStatus, "Checking availability…");
    try {
      const accounts = await client.database.getAccounts([name]);
      if (accounts && accounts.length) {
        showStatus(
          newuserStatus,
          `@${name} already exists. Choose another.`,
          "danger",
        );
        newUsernameValid = false;
        return;
      }
      showStatus(newuserStatus, `@${name} is available!`, "success");
      // Mark username as valid
      newUsernameValid = true;
      // Lock this input after successful validation
      newUserInput.disabled = true;
      checkNewuserBtn.disabled = true;
      // Check if we can proceed
      checkBothValidations();
    } catch (err) {
      showStatus(newuserStatus, err.message || err, "danger");
      newUsernameValid = false;
    }
  }

  // Helper: derive public & private keys from username + password (using dhive)
  function generateKeysFromPassword(accountName, password) {
    const roles = ["owner", "active", "posting", "memo"];
    const out = {};
    out.account = accountName;
    out.password = password;
    roles.forEach((role) => {
      const priv = dhive.PrivateKey.fromLogin(accountName, password, role);
      out[role] = {
        public: priv.createPublic().toString(),
        private: priv.toString(),
      };
    });
    return out;
  }

  // Generate a strong BIP39 mnemonic password
  function generatePassword() {
    try {
      const mnemonic = BIP39.generateMnemonic(128); // 12-word mnemonic
      passwordInput.value = mnemonic;
    } catch (e) {
      // fallback if BIP39 not available
      const charset =
        "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz123456789";
      let pass = "";
      for (let i = 0; i < 32; i++)
        pass += charset[Math.floor(Math.random() * charset.length)];
      passwordInput.value = pass;
    }
    updateKeys();
  }

  function updateKeys() {
    const name = newUserInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    if (!name || !password) return;
    const keys = generateKeysFromPassword(name, password);
    generatedKeys = keys;
    keysDisplay.textContent = JSON.stringify(keys, null, 2);
    keysSection.style.display = "";
    submitSection.style.display = "";
  }

  function downloadKeys() {
    if (!generatedKeys) return;
    const blob = new Blob([keysDisplay.textContent], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${newUserInput.value.trim()}_keys.json`;
    a.click();
    URL.revokeObjectURL(url);
    // Enable create button after user has downloaded keys
    createBtn.disabled = false;
  }

  function handleCreateAccount() {
    if (!window.hive_keychain) {
      alert("Hive Keychain not detected.");
      return;
    }
    const creator = claimerInput.value.trim();
    const newAcc = newUserInput.value.trim();
    const password = passwordInput.value;
    if (!creator || !newAcc || !password) {
      showToast("Missing required fields", "danger");
      return;
    }
    if (!generatedKeys) {
      showToast("Generate and download keys first", "danger");
      return;
    }
    console.log("Attempting to create claimed account with:", {
      creator,
      newAcc,
      owner: generatedKeys.owner.public,
      active: generatedKeys.active.public,
      posting: generatedKeys.posting.public,
      memo: generatedKeys.memo.public,
    });

    // Create the operation manually as Keychain's helper might have issues
    const op = [
      "create_claimed_account",
      {
        creator: creator,
        new_account_name: newAcc,
        owner: {
          weight_threshold: 1,
          account_auths: [],
          key_auths: [[generatedKeys.owner.public, 1]],
        },
        active: {
          weight_threshold: 1,
          account_auths: [],
          key_auths: [[generatedKeys.active.public, 1]],
        },
        posting: {
          weight_threshold: 1,
          account_auths: [],
          key_auths: [[generatedKeys.posting.public, 1]],
        },
        memo_key: generatedKeys.memo.public,
        json_metadata: "",
        extensions: [],
      },
    ];

    // Use the broadcast operation method instead
    hive_keychain.requestBroadcast(creator, [op], "Active", (resp) => {
      if (resp.success) {
        const link =
          resp.result && resp.result.id
            ? `https://hivehub.dev/tx/${resp.result.id}`
            : null;
        showToast(`Broadcast sent! Redirecting...`, "success");
        setTimeout(() => {
          const url = `/claim-account/success?tx=${resp.result.id}&acc=${encodeURIComponent(newAcc)}`;
          window.location.href = url;
        }, 1500);
      } else {
        const msg =
          resp.message === "user_cancel"
            ? "Transaction cancelled by user"
            : `Broadcast failed: ${resp.message || "Unknown error"}`;
        const level = resp.message === "user_cancel" ? "secondary" : "danger";
        showToast(msg, level);
      }
    });
  }

  // Event listeners
  checkClaimerBtn.addEventListener("click", handleCheckClaimer);
  checkNewuserBtn.addEventListener("click", handleCheckNewUser);
  regenPassBtn.addEventListener("click", generatePassword);
  passwordInput.addEventListener("input", updateKeys);
  downloadKeysBtn.addEventListener("click", downloadKeys);
  
  // Reset buttons
  const resetBtn = document.getElementById("reset-flow-btn");
  resetBtn.addEventListener("click", resetFlow);
  const topResetBtn = document.getElementById("top-reset-btn");
  topResetBtn.addEventListener("click", resetFlow);
  
  createBtn.addEventListener("click", handleCreateAccount);

  function resetFlow() {
    // enable initial inputs
    claimerInput.disabled = false;
    checkClaimerBtn.disabled = false;
    newUserInput.disabled = false;
    checkNewuserBtn.disabled = false;

    // clear values and status
    claimerInput.value = "";
    newUserInput.value = "";
    claimerStatus.innerHTML = "";
    newuserStatus.innerHTML = "";

    // hide sections
    passwordSection.style.display = "none";
    keysSection.style.display = "none";
    submitSection.style.display = "none";

    // reset keys/password
    passwordInput.value = "";
    keysDisplay.textContent = "";
    generatedKeys = null;
    
    // reset validation flags
    claimerValid = false;
    newUsernameValid = false;

    // buttons
    downloadKeysBtn.disabled = false;
    createBtn.disabled = true;

    showToast("Form reset. You can start again.", "secondary");
  }
})();
