const ACTION_CONFIG = {
  login: {
    subject: (username) => `New sign-in to your CodeSpace account`,
    badgeText: 'Login detected',
    heading: (username) => `New sign-in to your account`,
    subtitle: `We detected a new login to your CodeSpace account. If this was you, no action is needed.`,
    accentColor: '#1D4ED8',
    ctaLabel: 'Go to dashboard',
    ctaHref: (userId) => `https://codespace.io/dashboard`,
    showRevokeBtn: true,
    securityTitle: 'Not you?',
    securityBody: `Change your password and revoke all sessions from your security settings immediately.`,
    securityBg: '#FEF2F2',
    securityBorder: '#FECACA',
    securityTitleColor: '#991B1B',
    securityBodyColor: '#7F1D1D',
    securityIconColor: '#DC2626',
  },
  register: {
    subject: (username) => `Welcome to CodeSpace, ${username}`,
    badgeText: 'Account created',
    heading: (username) => `Welcome to CodeSpace, ${username}`,
    subtitle: `Your account has been created. You're all set to start building with AI-powered code generation.`,
    accentColor: '#059669',
    ctaLabel: 'Set up your workspace',
    ctaHref: (userId) => `https://codespace.io/onboarding`,
    showRevokeBtn: false,
    securityTitle: 'Keep your account safe',
    securityBody: `Enable two-factor authentication for an extra layer of security on your account.`,
    securityBg: '#F0FDF4',
    securityBorder: '#BBF7D0',
    securityTitleColor: '#14532D',
    securityBodyColor: '#166534',
    securityIconColor: '#16A34A',
  },
  password_reset: {
    subject: (username) => `Your CodeSpace password was changed`,
    badgeText: 'Password reset',
    heading: (username) => `Your password was changed`,
    subtitle: `Your CodeSpace account password was successfully updated. If you did not make this change, act immediately.`,
    accentColor: '#D97706',
    ctaLabel: 'Review account security',
    ctaHref: (userId) => `https://codespace.io/settings/security`,
    showRevokeBtn: true,
    securityTitle: 'If you did not request this',
    securityBody: `Contact our support team at security@codespace.io and we'll help you recover access immediately.`,
    securityBg: '#FFFBEB',
    securityBorder: '#FDE68A',
    securityTitleColor: '#78350F',
    securityBodyColor: '#92400E',
    securityIconColor: '#B45309',
  },
  logout: {
    subject: (username) => `You've been signed out of CodeSpace`,
    badgeText: 'Session ended',
    heading: (username) => `You've been signed out`,
    subtitle: `Your CodeSpace session has been terminated. All active sandbox processes have been stopped.`,
    accentColor: '#374151',
    ctaLabel: 'Sign back in',
    ctaHref: (userId) => `https://codespace.io/login`,
    showRevokeBtn: false,
    securityTitle: 'Signed out on all devices?',
    securityBody: `To end all active sessions across every device, visit your security settings.`,
    securityBg: '#F9FAFB',
    securityBorder: '#E5E7EB',
    securityTitleColor: '#111827',
    securityBodyColor: '#6B7280',
    securityIconColor: '#6B7280',
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
    body{background:#F4F5F7;font-family:'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased}
    a{text-decoration:none}
  </style>
</head>
<body>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F5F7;padding:40px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:4px;border:1px solid #E5E7EB;overflow:hidden;max-width:560px">

        <tr><td style="background:${config.accentColor};height:4px;font-size:0">&nbsp;</td></tr>

        <tr><td style="padding:36px 40px 28px">
          <table cellpadding="0" cellspacing="0" style="margin-bottom:32px">
            <tr>
              <td style="background:${config.accentColor};width:36px;height:36px;border-radius:6px;text-align:center;vertical-align:middle">
                <img src="https://your-cdn.com/logo-white.png" width="20" height="20" alt="CS" style="display:block;margin:auto"/>
              </td>
              <td style="padding-left:10px;font-size:15px;font-weight:600;color:#111827;letter-spacing:-0.01em">
                <span style="color:${config.accentColor}">Code</span>Space
              </td>
            </tr>
          </table>

          <div style="display:inline-flex;align-items:center;gap:6px;background:${config.securityBg};border:1px solid ${config.securityBorder};border-radius:4px;padding:5px 10px;margin-bottom:22px;font-size:11px;font-weight:600;color:${config.securityTitleColor};letter-spacing:0.04em;text-transform:uppercase">
            &bull;&nbsp;${config.badgeText}
          </div>

          <h1 style="font-size:24px;font-weight:600;color:#111827;line-height:1.3;letter-spacing:-0.02em;margin-bottom:8px">
            ${heading}
          </h1>
          <p style="font-size:14px;color:#6B7280;line-height:1.65">${config.subtitle}</p>
        </td></tr>

        <tr><td style="height:1px;background:#F3F4F6;font-size:0">&nbsp;</td></tr>

        <tr><td style="padding:24px 40px">
          <p style="font-size:10px;font-weight:600;color:#9CA3AF;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:14px">Event details</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
            <tr style="border-bottom:1px solid #F9FAFB">
              <td style="padding:10px 0;font-size:13px;color:#6B7280;width:38%">Time</td>
              <td style="padding:10px 0;font-size:13px;color:#111827;font-weight:500;text-align:right">${formattedTime}</td>
            </tr>
            <tr style="border-bottom:1px solid #F9FAFB">
              <td style="padding:10px 0;font-size:13px;color:#6B7280">Account</td>
              <td style="padding:10px 0;font-size:13px;color:#111827;font-weight:500;text-align:right">${email}</td>
            </tr>
            <tr style="border-bottom:1px solid #F9FAFB">
              <td style="padding:10px 0;font-size:13px;color:#6B7280">Action</td>
              <td style="padding:10px 0;font-size:13px;color:#111827;font-weight:500;text-align:right;text-transform:capitalize">${action.replace('_', ' ')}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;font-size:13px;color:#6B7280">User ID</td>
              <td style="padding:10px 0;font-size:12px;color:#111827;font-weight:500;text-align:right;font-family:'Courier New',monospace">${shortUserId}…</td>
            </tr>
          </table>
        </td></tr>

        <tr><td style="padding:0 40px 28px">
          <a href="${ctaHref}" style="display:block;width:100%;text-align:center;background:${config.accentColor};color:#ffffff;font-size:14px;font-weight:500;padding:13px;border-radius:6px;letter-spacing:-0.01em">
            ${config.ctaLabel}
          </a>
          ${config.showRevokeBtn ? `
          <a href="https://codespace.io/settings/security" style="display:block;width:100%;text-align:center;color:#DC2626;font-size:13px;font-weight:500;padding:11px;border-radius:6px;margin-top:10px;border:1.5px solid #FECACA">
            This wasn't me &mdash; secure my account
          </a>` : ''}
        </td></tr>

        <tr><td style="padding:0 40px 28px">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:${config.securityBg};border:1px solid ${config.securityBorder};border-radius:6px;padding:14px 16px">
            <tr>
              <td width="20" valign="top" style="padding-right:12px;padding-top:1px">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M8 1.5L2.5 3.75V8C2.5 11 5 13.5 8 14.5C11 13.5 13.5 11 13.5 8V3.75L8 1.5Z" stroke="${config.securityIconColor}" stroke-width="1.3" stroke-linejoin="round"/>
                  <path d="M5.5 8l1.5 1.5 3-3" stroke="${config.securityIconColor}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </td>
              <td>
                <p style="font-size:12px;font-weight:600;color:${config.securityTitleColor};margin-bottom:3px">${config.securityTitle}</p>
                <p style="font-size:12px;color:${config.securityBodyColor};line-height:1.55">${config.securityBody}</p>
              </td>
            </tr>
          </table>
        </td></tr>

        <tr><td style="background:#F9FAFB;border-top:1px solid #F3F4F6;padding:20px 40px;text-align:center">
          <p style="font-size:12px;font-weight:600;color:#374151;margin-bottom:4px">
            <span style="color:${config.accentColor}">Code</span>Space &middot; AI-Powered Dev Environment
          </p>
          <p style="font-size:11px;color:#9CA3AF">
            You're receiving this because security notifications are enabled &nbsp;&middot;&nbsp;
            <a href="https://codespace.io/unsubscribe" style="color:#9CA3AF">Unsubscribe</a> &nbsp;&middot;&nbsp;
            <a href="https://codespace.io/privacy" style="color:#9CA3AF">Privacy</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `${config.badgeText.toUpperCase()} — CodeSpace\n\n${heading}\n\n${config.subtitle}\n\nDetails\nTime: ${formattedTime}\nAccount: ${email}\nAction: ${action}\nUser ID: ${shortUserId}\n\nVisit: ${ctaHref}\n\n${config.securityTitle}: ${config.securityBody}\n\n---\nCodeSpace · security@codespace.io\nUnsubscribe: https://codespace.io/unsubscribe`;

  return { subject, html, text };
};

export default buildAuthEmail;