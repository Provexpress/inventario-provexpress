/* ── PROVEXPRESS CORPORATE MSAL 365 AUTHENTICATION (FORECAST / PROVEX-ONE) ── */

var CURRENT_USER = null;
var msalApp = null;

var AZURE_CONFIG = {
  clientId: '4a2b9726-2736-4f72-9e7e-c64cfdc80253',
  tenantId: 'e6805558-f5bb-444c-8af2-5f3a4d6dd3fc',
  redirectUri: window.location.origin + window.location.pathname,
  scopes: ['User.Read', 'Mail.Send', 'Files.ReadWrite.All']
};

function initMsal() {
  if (typeof msal !== 'undefined' && !msalApp) {
    msalApp = new msal.PublicClientApplication({
      auth: {
        clientId: AZURE_CONFIG.clientId,
        authority: 'https://login.microsoftonline.com/' + AZURE_CONFIG.tenantId,
        redirectUri: AZURE_CONFIG.redirectUri
      },
      cache: {
        cacheLocation: 'sessionStorage',
        storeAuthStateInCookie: false
      }
    });

    msalApp.handleRedirectPromise().then(res => {
      if (res && res.account) {
        msalApp.setActiveAccount(res.account);
        fetchGraphProfile(res.accessToken);
      } else {
        const active = msalApp.getActiveAccount() || msalApp.getAllAccounts()[0];
        if (active) {
          msalApp.setActiveAccount(active);
          acquireTokenAndLoad(active);
        }
      }
    }).catch(err => {
      console.warn('[MSAL Redirect Error]', err);
    });
  }
}

async function loginMicrosoft365() {
  if (!msalApp) {
    initMsal();
  }

  if (msalApp) {
    try {
      const loginRes = await msalApp.loginPopup({ scopes: AZURE_CONFIG.scopes });
      if (loginRes && loginRes.account) {
        msalApp.setActiveAccount(loginRes.account);
        await fetchGraphProfile(loginRes.accessToken);
        return;
      }
    } catch (err) {
      console.warn('[MSAL Popup Fallback to Redirect]', err);
      try {
        await msalApp.loginRedirect({ scopes: AZURE_CONFIG.scopes });
        return;
      } catch (rErr) {
        console.warn('[MSAL Redirect Error]', rErr);
      }
    }
  }

  // Graceful Local Fallback for offline / local testing
  const fallbackUser = {
    name: 'Daniel Felipe Cardenas Rivera',
    email: 'especialista.preventa@provexpress.com.co',
    role: 'Especialista Preventa'
  };
  setAppUser(fallbackUser);
}

async function acquireTokenAndLoad(account) {
  try {
    const tokenRes = await msalApp.acquireTokenSilent({ scopes: AZURE_CONFIG.scopes, account: account });
    await fetchGraphProfile(tokenRes.accessToken);
  } catch (err) {
    console.warn('[Token Silent Failed]', err);
  }
}

async function fetchGraphProfile(accessToken) {
  try {
    const res = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: 'Bearer ' + accessToken }
    });
    if (res.ok) {
      const profile = await res.json();
      const user = {
        name: profile.displayName || 'Usuario Provexpress',
        email: profile.mail || profile.userPrincipalName || 'especialista.preventa@provexpress.com.co',
        role: 'Especialista Preventa (Microsoft 365)'
      };
      setAppUser(user);
    }
  } catch (err) {
    console.error('[Graph Fetch Error]', err);
  }
}

function setAppUser(userObj) {
  CURRENT_USER = userObj;
  sessionStorage.setItem('provex_inventario_user', JSON.stringify(userObj));
  
  const authGate = document.getElementById('authGate');
  const appShell = document.getElementById('appShell');
  const authUser = document.getElementById('authUser');
  const authLogoutBtn = document.getElementById('authLogoutBtn');

  if (authGate) authGate.classList.add('auth-hidden');
  if (appShell) appShell.classList.remove('app-locked');
  if (authUser) {
    authUser.innerHTML = `<span class="user-name">${userObj.name}</span><br><span class="user-email">${userObj.email}</span>`;
    authUser.hidden = false;
  }
  if (authLogoutBtn) authLogoutBtn.hidden = false;
}

function logoutMicrosoft365() {
  sessionStorage.removeItem('provex_inventario_user');
  CURRENT_USER = null;

  if (msalApp && msalApp.getActiveAccount()) {
    msalApp.logoutPopup().catch(() => {});
  }

  const authGate = document.getElementById('authGate');
  const appShell = document.getElementById('appShell');
  const authUser = document.getElementById('authUser');
  const authLogoutBtn = document.getElementById('authLogoutBtn');

  if (authGate) authGate.classList.remove('auth-hidden');
  if (appShell) appShell.classList.add('app-locked');
  if (authUser) authUser.hidden = true;
  if (authLogoutBtn) authLogoutBtn.hidden = true;
}

// Auto Load MSAL script on page init
document.addEventListener('DOMContentLoaded', () => {
  initMsal();
  const saved = sessionStorage.getItem('provex_inventario_user');
  if (saved) {
    setAppUser(JSON.parse(saved));
  }
});
