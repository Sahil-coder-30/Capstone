const ACTION_CONFIG = {
  login: {
    subject: (username) => `New sign-in to your CodeSpace account`,
    badgeText: 'Login detected',
    heading: (username) => `New sign-in to your account`,
    subtitle: `We detected a new login to your CodeSpace account. If this was you, no action is needed.`,
    accentColor: '#1B6EF3', // Brand Blue
    ctaLabel: 'Go to dashboard',
    ctaHref: (userId) => `https://codespace.io/dashboard`,
    showRevokeBtn: true,
    securityTitle: 'Not you?',
    securityBody: `Change your password and revoke all sessions from your security settings immediately.`,
    securityBg: '#FEF2F2',
    securityBorder: '#FEE2E2',
    securityTitleColor: '#991B1B',
    securityBodyColor: '#7F1D1D',
    securityIconColor: '#EF4444',
  },
  register: {
    subject: (username) => `Welcome to CodeSpace, ${username}`,
    badgeText: 'Account created',
    heading: (username) => `Welcome to CodeSpace, ${username}`,
    subtitle: `Your account has been created. You're all set to start building with AI-powered code generation.`,
    accentColor: '#0D8A6A', // Brand Teal
    ctaLabel: 'Set up your workspace',
    ctaHref: (userId) => `https://codespace.io/onboarding`,
    showRevokeBtn: false,
    securityTitle: 'Keep your account safe',
    securityBody: `Enable two-factor authentication for an extra layer of security on your account.`,
    securityBg: '#F0FDF4',
    securityBorder: '#DCFCE7',
    securityTitleColor: '#14532D',
    securityBodyColor: '#166534',
    securityIconColor: '#10B981',
  },
  password_reset: {
    subject: (username) => `Your CodeSpace password was changed`,
    badgeText: 'Password reset',
    heading: (username) => `Your password was changed`,
    subtitle: `Your CodeSpace account password was successfully updated. If you did not make this change, act immediately.`,
    accentColor: '#D97706', // Warning amber
    ctaLabel: 'Review account security',
    ctaHref: (userId) => `https://codespace.io/settings/security`,
    showRevokeBtn: true,
    securityTitle: 'If you did not request this',
    securityBody: `Contact our support team at security@codespace.io and we'll help you recover access immediately.`,
    securityBg: '#FFFBEB',
    securityBorder: '#FEF3C7',
    securityTitleColor: '#78350F',
    securityBodyColor: '#92400E',
    securityIconColor: '#F59E0B',
  },
  logout: {
    subject: (username) => `You've been signed out of CodeSpace`,
    badgeText: 'Session ended',
    heading: (username) => `You've been signed out`,
    subtitle: `Your CodeSpace session has been terminated. All active sandbox processes have been stopped.`,
    accentColor: '#475569', // Slate grey
    ctaLabel: 'Sign back in',
    ctaHref: (userId) => `https://codespace.io/login`,
    showRevokeBtn: false,
    securityTitle: 'Signed out on all devices?',
    securityBody: `To end all active sessions across every device, visit your security settings.`,
    securityBg: '#F8FAFC',
    securityBorder: '#E2E8F0',
    securityTitleColor: '#0F172A',
    securityBodyColor: '#475569',
    securityIconColor: '#64748B',
  },
};

const buildAuthEmail = ({ username, email, userId, timestamps, action }) => {
  const config = ACTION_CONFIG[action] ?? ACTION_CONFIG['login'];
  const formattedTime = new Date(timestamps).toLocaleString('en-IN', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  });

  const subject = config.subject(username);
  const heading = config.heading(username);
  const ctaHref = config.ctaHref(userId);
  const shortUserId = String(userId).slice(0, 16);

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${subject}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#F4F5F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
    a{text-decoration:none}
  </style>
</head>
<body>
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:48px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;border:1px solid #e2e8f0;max-width:540px;text-align:left;box-shadow:0 4px 6px -1px rgba(0,0,0,0.03),0 2px 4px -1px rgba(0,0,0,0.02);border-collapse:collapse">

        <tr><td style="background-color:${config.accentColor};height:4px;border-top-left-radius:12px;border-top-right-radius:12px;font-size:0;line-height:0">&nbsp;</td></tr>

        <tr>
          <td style="padding:40px 40px 0">
            <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
              <tr>
                <td style="background-color:#0D8A6A;width:32px;height:32px;border-radius:8px;text-align:center;vertical-align:middle">
                  <span style="color:#ffffff;font-size:16px;font-weight:800;font-family:'Courier New',monospace">&gt;_</span>
                </td>
                <td style="padding-left:12px;font-size:18px;font-weight:700;color:#0f172a;letter-spacing:-0.03em">
                  TAKSHA <span style="font-weight:400;color:#64748b">CODESPACE</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:32px 40px 0">
            <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
              <tr>
                <td style="background-color:${config.securityBg};border:1px solid ${config.securityBorder};border-radius:20px;padding:4px 12px;font-size:11px;font-weight:600;color:${config.securityTitleColor};letter-spacing:0.05em;text-transform:uppercase;line-height:1">
                  &bull;&nbsp;${config.badgeText}
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:20px 40px 0">
            <h1 style="font-size:24px;font-weight:700;color:#0f172a;line-height:1.3;letter-spacing:-0.02em;margin:0 0 10px 0">
              ${heading}
            </h1>
            <p style="font-size:15px;color:#475569;line-height:1.6;margin:0">
              ${config.subtitle}
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:24px 40px 0">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;border-collapse:collapse">
              <tr>
                <td colspan="2" style="font-size:11px;font-weight:700;color:#64748b;letter-spacing:0.08em;text-transform:uppercase;padding-bottom:12px">
                  Security Log Details
                </td>
              </tr>
              <tr style="border-bottom:1px solid #f1f5f9">
                <td style="padding:8px 0;font-size:13px;color:#64748b">Time</td>
                <td style="padding:8px 0;font-size:13px;color:#0f172a;font-weight:600;text-align:right">${formattedTime}</td>
              </tr>
              <tr style="border-bottom:1px solid #f1f5f9">
                <td style="padding:8px 0;font-size:13px;color:#64748b">Account</td>
                <td style="padding:8px 0;font-size:13px;color:#0f172a;font-weight:600;text-align:right">${email}</td>
              </tr>
              <tr style="border-bottom:1px solid #f1f5f9">
                <td style="padding:8px 0;font-size:13px;color:#64748b">Action</td>
                <td style="padding:8px 0;font-size:13px;color:#0f172a;font-weight:600;text-align:right;text-transform:capitalize">${action.replace('_', ' ')}</td>
              </tr>
              <tr>
                <td style="padding:8px 0 0 0;font-size:13px;color:#64748b">User ID</td>
                <td style="padding:8px 0 0 0;font-size:12px;color:#0f172a;font-weight:600;font-family:'SFMono-Regular',Consolas,Menlo,monospace;text-align:right">${shortUserId}…</td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:28px 40px 0">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
              <tr>
                <td align="center">
                  <a href="${ctaHref}" target="_blank" style="display:block;background-color:${config.accentColor};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:6px;letter-spacing:-0.01em;box-shadow:0 2px 4px rgba(0,0,0,0.05)">
                    ${config.ctaLabel}
                  </a>
                </td>
              </tr>
              ${config.showRevokeBtn ? `
              <tr>
                <td align="center" style="padding-top:10px">
                  <a href="https://codespace.io/settings/security" target="_blank" style="display:block;background-color:#ffffff;color:#dc2626;font-size:13px;font-weight:600;text-align:center;text-decoration:none;padding:10px 24px;border-radius:6px;border:1px solid #fca5a5">
                    This wasn't me &mdash; secure my account
                  </a>
                </td>
              </tr>` : ''}
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:24px 40px 0">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color:${config.securityBg};border-left:4px solid ${config.securityIconColor};border-radius:4px;border-collapse:collapse">
              <tr>
                <td style="padding:16px 20px">
                  <div style="font-size:13px;font-weight:700;color:${config.securityTitleColor};margin-bottom:4px;letter-spacing:-0.01em">
                    ${config.securityTitle}
                  </div>
                  <div style="font-size:13px;color:${config.securityBodyColor};line-height:1.5">
                    ${config.securityBody}
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr><td style="padding:32px 0 0 0;font-size:0;line-height:0">&nbsp;</td></tr>

        <tr>
          <td style="background-color:#f8fafc;border-top:1px solid #e2e8f0;border-bottom-left-radius:12px;border-bottom-right-radius:12px;padding:24px 40px;text-align:center">
            <p style="font-size:12px;font-weight:600;color:#475569;margin:0 0 6px 0">
              Taksha CodeSpace &middot; AI-Powered Dev Environment
            </p>
            <p style="font-size:11px;color:#94a3b8;margin:0;line-height:1.5">
              You're receiving this because security notifications are enabled for your account.<br/>
              <a href="https://codespace.io/unsubscribe" target="_blank" style="color:#0D8A6A;text-decoration:none;font-weight:500">Unsubscribe</a> &nbsp;&middot;&nbsp;
              <a href="https://codespace.io/privacy" target="_blank" style="color:#0D8A6A;text-decoration:none;font-weight:500">Privacy Policy</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `${config.badgeText.toUpperCase()} — CodeSpace\n\n${heading}\n\n${config.subtitle}\n\nDetails\nTime: ${formattedTime}\nAccount: ${email}\nAction: ${action}\nUser ID: ${shortUserId}\n\nVisit: ${ctaHref}\n\n${config.securityTitle}: ${config.securityBody}\n\n---\nCodeSpace · security@codespace.io\nUnsubscribe: https://codespace.io/unsubscribe`;

  return { subject, html, text };
};

export default buildAuthEmail;