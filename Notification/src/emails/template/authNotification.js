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

const buildAuthEmail = ({ username = 'User', email = '', userId = '', timestamps = Date.now(), action = 'login' }) => {
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

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <title>${subject}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
    a { text-decoration: none; }
    @media only screen and (max-width: 600px) {
      .container { width: 100% !important; padding: 16px !important; }
      .content-cell { padding: 24px 20px !important; }
    }
  </style>
</head>
<body style="background-color: #f8fafc; margin: 0; padding: 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; padding: 40px 16px; width: 100%;">
    <tr>
      <td align="center">
        <!--[if mso]>
        <table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0">
        <tr><td>
        <![endif]-->
        <table role="presentation" class="container" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; text-align: left; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.03), 0 2px 4px -1px rgba(0,0,0,0.02);">

          <!-- Top Accent Line -->
          <tr>
            <td style="background-color: ${config.accentColor}; height: 5px; font-size: 0; line-height: 0;">&nbsp;</td>
          </tr>

          <!-- Header Logo -->
          <tr>
            <td class="content-cell" style="padding: 36px 40px 0 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background-color: #0D8A6A; width: 34px; height: 34px; border-radius: 8px; text-align: center; vertical-align: middle;">
                    <span style="color: #ffffff; font-size: 16px; font-weight: 800; font-family: 'Courier New', monospace;">&gt;_</span>
                  </td>
                  <td style="padding-left: 12px; font-size: 18px; font-weight: 700; color: #0f172a; letter-spacing: -0.03em;">
                    TAKSHA <span style="font-weight: 400; color: #64748b;">CODESPACE</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Action Badge -->
          <tr>
            <td class="content-cell" style="padding: 28px 40px 0 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background-color: ${config.securityBg}; border: 1px solid ${config.securityBorder}; border-radius: 20px; padding: 6px 14px; font-size: 12px; font-weight: 700; color: ${config.securityTitleColor}; letter-spacing: 0.04em; text-transform: uppercase;">
                    &bull;&nbsp;${config.badgeText}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content Header -->
          <tr>
            <td class="content-cell" style="padding: 16px 40px 0 40px;">
              <h1 style="font-size: 24px; font-weight: 700; color: #0f172a; line-height: 1.3; letter-spacing: -0.02em; margin: 0 0 10px 0;">
                ${heading}
              </h1>
              <p style="font-size: 15px; color: #334155; line-height: 1.6; margin: 0;">
                ${config.subtitle}
              </p>
            </td>
          </tr>

          <!-- Details Card -->
          <tr>
            <td class="content-cell" style="padding: 24px 40px 0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px 20px;">
                <tr>
                  <td colspan="2" style="font-size: 12px; font-weight: 700; color: #64748b; letter-spacing: 0.08em; text-transform: uppercase; padding-bottom: 12px;">
                    Security Log Details
                  </td>
                </tr>
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <td style="padding: 8px 0; font-size: 13px; color: #64748b;">Time</td>
                  <td style="padding: 8px 0; font-size: 13px; color: #0f172a; font-weight: 600; text-align: right;">${formattedTime}</td>
                </tr>
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <td style="padding: 8px 0; font-size: 13px; color: #64748b;">Account</td>
                  <td style="padding: 8px 0; font-size: 13px; color: #0f172a; font-weight: 600; text-align: right;">${email}</td>
                </tr>
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <td style="padding: 8px 0; font-size: 13px; color: #64748b;">Action</td>
                  <td style="padding: 8px 0; font-size: 13px; color: #0f172a; font-weight: 600; text-align: right; text-transform: capitalize;">${action.replace('_', ' ')}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0 0 0; font-size: 13px; color: #64748b;">User ID</td>
                  <td style="padding: 8px 0 0 0; font-size: 12px; color: #0f172a; font-weight: 600; font-family: monospace; text-align: right;">${shortUserId}…</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA Button -->
          <tr>
            <td class="content-cell" style="padding: 28px 40px 0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${ctaHref}" style="height:44px;v-text-anchor:middle;width:220px;" arcsize="14%" stroke="f" fillcolor="${config.accentColor}">
                      <w:anchorlock/>
                      <center style="color:#ffffff;font-family:sans-serif;font-size:14px;font-weight:bold;">${config.ctaLabel}</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-->
                    <a href="${ctaHref}" target="_blank" style="display: inline-block; background-color: ${config.accentColor}; color: #ffffff; font-size: 14px; font-weight: 700; text-decoration: none; padding: 13px 28px; border-radius: 6px; letter-spacing: -0.01em; box-shadow: 0 2px 4px rgba(0,0,0,0.06);">
                      ${config.ctaLabel}
                    </a>
                    <!--<![endif]-->
                  </td>
                </tr>
                ${config.showRevokeBtn ? `
                <tr>
                  <td align="center" style="padding-top: 12px;">
                    <a href="https://codespace.io/settings/security" target="_blank" style="display: inline-block; background-color: #ffffff; color: #dc2626; font-size: 13px; font-weight: 600; text-decoration: none; padding: 10px 20px; border-radius: 6px; border: 1px solid #fca5a5;">
                      This wasn't me &mdash; secure my account
                    </a>
                  </td>
                </tr>` : ''}
              </table>
            </td>
          </tr>

          <!-- Security Callout Box -->
          <tr>
            <td class="content-cell" style="padding: 24px 40px 0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: ${config.securityBg}; border-left: 4px solid ${config.securityIconColor}; border-radius: 6px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <div style="font-size: 13px; font-weight: 700; color: ${config.securityTitleColor}; margin-bottom: 4px;">
                      ${config.securityTitle}
                    </div>
                    <div style="font-size: 13px; color: ${config.securityBodyColor}; line-height: 1.5;">
                      ${config.securityBody}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr><td style="padding: 32px 0 0 0; font-size: 0; line-height: 0;">&nbsp;</td></tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; border-bottom-left-radius: 12px; border-bottom-right-radius: 12px; padding: 24px 40px; text-align: center;">
              <p style="font-size: 12px; font-weight: 600; color: #475569; margin: 0 0 6px 0;">
                Taksha CodeSpace &middot; AI-Powered Dev Environment
              </p>
              <p style="font-size: 11px; color: #94a3b8; margin: 0; line-height: 1.5;">
                You are receiving this automated email security notification for your account.<br/>
                <a href="https://codespace.io/unsubscribe" target="_blank" style="color: #0D8A6A; text-decoration: none; font-weight: 600;">Unsubscribe</a> &nbsp;&middot;&nbsp;
                <a href="https://codespace.io/privacy" target="_blank" style="color: #0D8A6A; text-decoration: none; font-weight: 600;">Privacy Policy</a> &nbsp;&middot;&nbsp;
                <a href="https://codespace.io/support" target="_blank" style="color: #0D8A6A; text-decoration: none; font-weight: 600;">Support</a>
              </p>
            </td>
          </tr>

        </table>
        <!--[if mso]>
        </td></tr></table>
        <![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `${config.badgeText.toUpperCase()} — Taksha CodeSpace\n\n` +
    `${heading}\n\n` +
    `${config.subtitle}\n\n` +
    `DETAILS:\n` +
    `Time: ${formattedTime}\n` +
    `Account: ${email}\n` +
    `Action: ${action}\n` +
    `User ID: ${shortUserId}\n\n` +
    `Visit: ${ctaHref}\n\n` +
    `${config.securityTitle}: ${config.securityBody}\n\n` +
    `---\nTaksha CodeSpace Security · security@codespace.io`;

  return { subject, html, text };
};

export default buildAuthEmail;