/**
 * Payment Notification Email Generator
 * Light-mode industry standard HTML email templates following email-design guidelines.
 * Supports: payment_success, payment_failed, payment_cancelled, payment_report
 */

const formatCurrency = (amount, currency = 'INR') => {
  if (amount === undefined || amount === null) return '₹0.00';
  const num = typeof amount === 'number' ? amount : parseFloat(amount);
  if (isNaN(num)) return '₹0.00';
  
  // Razorpay amounts are sometimes sent in paise (integer cents), convert if large integer
  const finalNum = num > 10000 && Number.isInteger(num) ? num / 100 : num;
  
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(finalNum);
};

const ACTION_CONFIG = {
  payment_success: {
    badgeText: 'Payment Successful',
    heading: 'Payment Confirmed',
    subtitle: 'Thank you for your payment! Your transaction was completed successfully via Razorpay.',
    accentColor: '#0D8A6A', // Emerald Teal
    badgeBg: '#ECFDF5',
    badgeBorder: '#A7F3D0',
    badgeTextColor: '#047857',
    ctaLabel: 'View Dashboard',
    ctaHref: 'https://codespace.io/dashboard',
    subject: (username, amount) => `Payment Receipt: ${amount} — Taksha CodeSpace`,
    noticeTitle: 'Need help with your invoice?',
    noticeBody: 'If you have any questions regarding this charge or subscription, please contact billing@codespace.io.',
    noticeBg: '#F0FDF4',
    noticeBorder: '#DCFCE7',
    noticeTitleColor: '#14532D',
    noticeBodyColor: '#166534',
  },
  payment_failed: {
    badgeText: 'Payment Failed',
    heading: 'Payment Issue Detected',
    subtitle: 'We were unable to process your payment via Razorpay. No funds were debited or a refund will be auto-processed.',
    accentColor: '#DC2626', // Ruby Red
    badgeBg: '#FEF2F2',
    badgeBorder: '#FECACA',
    badgeTextColor: '#B91C1C',
    ctaLabel: 'Retry Payment',
    ctaHref: 'https://codespace.io/checkout',
    subject: (username, amount) => `Action Required: Payment Failed — Taksha CodeSpace`,
    noticeTitle: 'Why did this happen?',
    noticeBody: 'Common reasons include insufficient funds, bank authentication timeout, or card decline. You can retry with another payment method.',
    noticeBg: '#FEF2F2',
    noticeBorder: '#FEE2E2',
    noticeTitleColor: '#991B1B',
    noticeBodyColor: '#7F1D1D',
  },
  payment_cancelled: {
    badgeText: 'Payment Cancelled',
    heading: 'Payment Was Cancelled',
    subtitle: 'Your transaction session was cancelled before completion. No charges were made to your account.',
    accentColor: '#64748B', // Slate Grey
    badgeBg: '#F1F5F9',
    badgeBorder: '#E2E8F0',
    badgeTextColor: '#475569',
    ctaLabel: 'Return to Checkout',
    ctaHref: 'https://codespace.io/checkout',
    subject: (username) => `Payment Cancelled — Taksha CodeSpace`,
    noticeTitle: 'Changed your mind?',
    noticeBody: 'You can resume your plan selection or upgrade anytime from your workspace settings.',
    noticeBg: '#F8FAFC',
    noticeBorder: '#E2E8F0',
    noticeTitleColor: '#0F172A',
    noticeBodyColor: '#475569',
  },
  payment_report: {
    badgeText: 'Tax Receipt Report',
    heading: 'Payment & Statement Report',
    subtitle: 'Here is your official itemized transaction statement and tax receipt for your record.',
    accentColor: '#1B6EF3', // Sapphire Blue
    badgeBg: '#EFF6FF',
    badgeBorder: '#BFDBFE',
    badgeTextColor: '#1D4ED8',
    ctaLabel: 'Download Full Statement',
    ctaHref: 'https://codespace.io/billing/invoices',
    subject: (username, amount, invoiceNo) => `Payment Statement Report [${invoiceNo || 'INV-REC'}] — Taksha CodeSpace`,
    noticeTitle: 'Official Tax Invoice',
    noticeBody: 'This document serves as an official tax invoice. Keep a copy for your accounting and tax filing.',
    noticeBg: '#EFF6FF',
    noticeBorder: '#DBEAFE',
    noticeTitleColor: '#1E40AF',
    noticeBodyColor: '#1E3A8A',
  },
};

const buildPaymentEmail = ({
  username = 'Valued Customer',
  email = '',
  action = 'payment_success',
  transactionDetails = {},
  items = [],
  invoiceNumber = '',
  timestamps = Date.now(),
}) => {
  const config = ACTION_CONFIG[action] || ACTION_CONFIG.payment_success;
  
  const paymentId = transactionDetails.razorpay_payment_id || transactionDetails.paymentId || transactionDetails.id || 'N/A';
  const orderId = transactionDetails.razorpay_order_id || transactionDetails.orderId || 'N/A';
  const rawAmount = transactionDetails.amount || transactionDetails.totalAmount || 0;
  const currency = transactionDetails.currency || 'INR';
  const formattedAmount = formatCurrency(rawAmount, currency);
  const paymentMethod = (transactionDetails.method || transactionDetails.paymentMethod || 'Razorpay Online').toUpperCase();
  const statusStr = (transactionDetails.status || action.replace('payment_', '')).toUpperCase();
  const description = transactionDetails.description || transactionDetails.planName || 'Taksha CodeSpace Pro Plan';
  const errorReason = transactionDetails.errorReason || transactionDetails.error_description || null;

  const invoiceNo = invoiceNumber || transactionDetails.invoiceNumber || `INV-${String(orderId).slice(-8).toUpperCase()}`;

  const formattedTime = new Date(timestamps).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  });

  const subject = config.subject(username, formattedAmount, invoiceNo);

  // Line items breakdown for report / receipt
  const itemList = items.length > 0 ? items : [
    {
      description: description,
      qty: 1,
      price: rawAmount,
    }
  ];

  const subtotal = rawAmount;
  const taxAmount = transactionDetails.tax || Math.round(subtotal * 0.18); // 18% GST estimate if applicable
  const grandTotal = transactionDetails.grandTotal || (action === 'payment_report' ? subtotal + taxAmount : subtotal);

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
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
      .mobile-stack { display: block !important; width: 100% !important; }
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
          
          <!-- Top Accent Bar -->
          <tr>
            <td style="background-color: ${config.accentColor}; height: 5px; font-size: 0; line-height: 0;">&nbsp;</td>
          </tr>

          <!-- Header Section -->
          <tr>
            <td class="content-cell" style="padding: 36px 40px 0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="left" style="vertical-align: middle;">
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
                  <td align="right" style="vertical-align: middle;">
                    <span style="font-size: 12px; font-weight: 600; color: #64748b; font-family: monospace;">${invoiceNo}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Status Badge -->
          <tr>
            <td class="content-cell" style="padding: 28px 40px 0 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background-color: ${config.badgeBg}; border: 1px solid ${config.badgeBorder}; border-radius: 20px; padding: 6px 14px; font-size: 12px; font-weight: 700; color: ${config.badgeTextColor}; letter-spacing: 0.04em; text-transform: uppercase;">
                    &bull;&nbsp;${config.badgeText}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Heading -->
          <tr>
            <td class="content-cell" style="padding: 16px 40px 0 40px;">
              <h1 style="font-size: 24px; font-weight: 700; color: #0f172a; line-height: 1.3; letter-spacing: -0.02em; margin: 0 0 8px 0;">
                ${config.heading}
              </h1>
              <p style="font-size: 15px; color: #334155; line-height: 1.6; margin: 0;">
                Hello <strong style="color: #0f172a;">${username}</strong>, ${config.subtitle}
              </p>
            </td>
          </tr>

          <!-- Payment Summary Card -->
          <tr>
            <td class="content-cell" style="padding: 24px 40px 0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px;">
                <tr>
                  <td style="font-size: 12px; font-weight: 700; color: #64748b; letter-spacing: 0.08em; text-transform: uppercase; padding-bottom: 14px;">
                    Razorpay Transaction Details
                  </td>
                </tr>
                <tr>
                  <td>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr style="border-bottom: 1px solid #f1f5f9;">
                        <td style="padding: 8px 0; font-size: 14px; color: #64748b;">Amount</td>
                        <td style="padding: 8px 0; font-size: 18px; font-weight: 700; color: #0f172a; text-align: right;">${formattedAmount}</td>
                      </tr>
                      <tr style="border-bottom: 1px solid #f1f5f9;">
                        <td style="padding: 8px 0; font-size: 13px; color: #64748b;">Payment ID</td>
                        <td style="padding: 8px 0; font-size: 13px; font-weight: 600; color: #0f172a; text-align: right; font-family: monospace;">${paymentId}</td>
                      </tr>
                      <tr style="border-bottom: 1px solid #f1f5f9;">
                        <td style="padding: 8px 0; font-size: 13px; color: #64748b;">Order ID</td>
                        <td style="padding: 8px 0; font-size: 13px; font-weight: 600; color: #0f172a; text-align: right; font-family: monospace;">${orderId}</td>
                      </tr>
                      <tr style="border-bottom: 1px solid #f1f5f9;">
                        <td style="padding: 8px 0; font-size: 13px; color: #64748b;">Payment Method</td>
                        <td style="padding: 8px 0; font-size: 13px; font-weight: 600; color: #0f172a; text-align: right;">${paymentMethod}</td>
                      </tr>
                      <tr style="border-bottom: 1px solid #f1f5f9;">
                        <td style="padding: 8px 0; font-size: 13px; color: #64748b;">Date & Time</td>
                        <td style="padding: 8px 0; font-size: 13px; font-weight: 600; color: #0f172a; text-align: right;">${formattedTime}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0 0 0; font-size: 13px; color: #64748b;">Status</td>
                        <td style="padding: 8px 0 0 0; font-size: 13px; font-weight: 700; color: ${config.accentColor}; text-align: right;">${statusStr}</td>
                      </tr>
                      ${errorReason ? `
                      <tr style="border-top: 1px solid #fee2e2;">
                        <td style="padding: 8px 0 0 0; font-size: 13px; color: #dc2626;">Error Reason</td>
                        <td style="padding: 8px 0 0 0; font-size: 13px; font-weight: 600; color: #dc2626; text-align: right;">${errorReason}</td>
                      </tr>` : ''}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${action === 'payment_report' || action === 'payment_success' ? `
          <!-- Item Breakdown Table -->
          <tr>
            <td class="content-cell" style="padding: 24px 40px 0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;">
                <thead>
                  <tr style="border-bottom: 2px solid #e2e8f0;">
                    <th align="left" style="padding: 10px 0; font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase;">Description</th>
                    <th align="center" style="padding: 10px 0; font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase;">Qty</th>
                    <th align="right" style="padding: 10px 0; font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase;">Price</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemList.map(item => `
                  <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 12px 0; font-size: 14px; font-weight: 600; color: #0f172a;">${item.description}</td>
                    <td align="center" style="padding: 12px 0; font-size: 14px; color: #334155;">${item.qty || 1}</td>
                    <td align="right" style="padding: 12px 0; font-size: 14px; font-weight: 600; color: #0f172a;">${formatCurrency(item.price, currency)}</td>
                  </tr>`).join('')}
                </tbody>
                <tfoot>
                  <tr>
                    <td colspan="2" align="right" style="padding-top: 14px; font-size: 13px; color: #64748b;">Subtotal</td>
                    <td align="right" style="padding-top: 14px; font-size: 13px; font-weight: 600; color: #0f172a;">${formatCurrency(subtotal, currency)}</td>
                  </tr>
                  ${action === 'payment_report' ? `
                  <tr>
                    <td colspan="2" align="right" style="padding-top: 6px; font-size: 13px; color: #64748b;">Estimated GST (18%)</td>
                    <td align="right" style="padding-top: 6px; font-size: 13px; font-weight: 600; color: #0f172a;">${formatCurrency(taxAmount, currency)}</td>
                  </tr>` : ''}
                  <tr>
                    <td colspan="2" align="right" style="padding-top: 10px; font-size: 15px; font-weight: 700; color: #0f172a;">Total Paid</td>
                    <td align="right" style="padding-top: 10px; font-size: 18px; font-weight: 800; color: ${config.accentColor};">${formatCurrency(grandTotal, currency)}</td>
                  </tr>
                </tfoot>
              </table>
            </td>
          </tr>` : ''}

          <!-- CTA Button -->
          <tr>
            <td class="content-cell" style="padding: 32px 40px 0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${config.ctaHref}" style="height:46px;v-text-anchor:middle;width:240px;" arcsize="13%" stroke="f" fillcolor="${config.accentColor}">
                      <w:anchorlock/>
                      <center style="color:#ffffff;font-family:sans-serif;font-size:14px;font-weight:bold;">${config.ctaLabel}</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-->
                    <a href="${config.ctaHref}" target="_blank" style="display: inline-block; background-color: ${config.accentColor}; color: #ffffff; font-size: 14px; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 6px; letter-spacing: -0.01em; box-shadow: 0 2px 4px rgba(0,0,0,0.08);">
                      ${config.ctaLabel}
                    </a>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Security / Support Notice Box -->
          <tr>
            <td class="content-cell" style="padding: 28px 40px 0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: ${config.noticeBg}; border-left: 4px solid ${config.accentColor}; border-radius: 6px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <div style="font-size: 14px; font-weight: 700; color: ${config.noticeTitleColor}; margin-bottom: 4px;">
                      ${config.noticeTitle}
                    </div>
                    <div style="font-size: 13px; color: ${config.noticeBodyColor}; line-height: 1.5;">
                      ${config.noticeBody}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr><td style="padding: 36px 0 0 0; font-size: 0; line-height: 0;">&nbsp;</td></tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; border-bottom-left-radius: 12px; border-bottom-right-radius: 12px; padding: 24px 40px; text-align: center;">
              <p style="font-size: 12px; font-weight: 600; color: #475569; margin: 0 0 6px 0;">
                Taksha CodeSpace &middot; Financial Services & Payment Gateway
              </p>
              <p style="font-size: 11px; color: #94a3b8; margin: 0; line-height: 1.5;">
                You are receiving this automated email receipt for your transaction on Taksha CodeSpace.<br/>
                <a href="https://codespace.io/support" target="_blank" style="color: #0D8A6A; text-decoration: none; font-weight: 600;">Support</a> &nbsp;&middot;&nbsp;
                <a href="https://codespace.io/privacy" target="_blank" style="color: #0D8A6A; text-decoration: none; font-weight: 600;">Privacy Policy</a> &nbsp;&middot;&nbsp;
                <a href="https://codespace.io/terms" target="_blank" style="color: #0D8A6A; text-decoration: none; font-weight: 600;">Terms of Service</a>
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
    `${config.heading}\n` +
    `Hello ${username},\n${config.subtitle}\n\n` +
    `SUMMARY:\n` +
    `Amount: ${formattedAmount}\n` +
    `Payment ID: ${paymentId}\n` +
    `Order ID: ${orderId}\n` +
    `Method: ${paymentMethod}\n` +
    `Date: ${formattedTime}\n` +
    `Status: ${statusStr}\n` +
    (errorReason ? `Error Reason: ${errorReason}\n` : '') +
    `\nVisit: ${config.ctaHref}\n\n` +
    `${config.noticeTitle}: ${config.noticeBody}\n\n` +
    `---\nTaksha CodeSpace Billing · billing@codespace.io`;

  return { subject, html, text };
};

export default buildPaymentEmail;
