import 'server-only';

/** Escape minimal HTML-sensitive characters for interpolated email copy. */
export function escapeHtmlForEmail(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function baseEmailTemplate(content: string, previewText?: string): string {
  const previewBlock =
    previewText !== undefined && previewText.trim().length > 0
      ? `
  <div style="display:none;max-height:0;overflow:hidden;
    mso-hide:all;">${escapeHtmlForEmail(previewText)}</div>`
      : '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport"
        content="width=device-width, initial-scale=1.0">
  <title>NexCap - DBJ</title>
  ${previewBlock}
</head>
<body style="margin:0;padding:0;background-color:#f4f6f9;
  font-family:Arial,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0"
         style="background-color:#f4f6f9;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0"
               style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background-color:#0B1F45;
                       border-radius:12px 12px 0 0;
                       padding:28px 40px;
                       text-align:center;">
              <p style="margin:0;font-size:22px;
                        font-weight:700;color:#ffffff;
                        letter-spacing:-0.5px;">
                NexCap
              </p>
              <p style="margin:6px 0 0;font-size:12px;
                        color:rgba(255,255,255,0.5);
                        letter-spacing:0.5px;">
                DEVELOPMENT BANK OF JAMAICA
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background-color:#ffffff;
                       padding:40px;
                       border-left:1px solid #e8ecf0;
                       border-right:1px solid #e8ecf0;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8f9fb;
                       border:1px solid #e8ecf0;
                       border-top:none;
                       border-radius:0 0 12px 12px;
                       padding:24px 40px;
                       text-align:center;">
              <p style="margin:0;font-size:12px;
                        color:#9ca3af;">
                Development Bank of Jamaica
              </p>
              <p style="margin:4px 0 0;font-size:12px;
                        color:#9ca3af;">
                11a-15 Oxford Road, Kingston 5, Jamaica
              </p>
              <p style="margin:12px 0 0;font-size:11px;
                        color:#c4c9d0;">
                This email was sent from an automated
                system. Please do not reply directly
                to this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function ctaButton(text: string, url: string): string {
  const safeText = escapeHtmlForEmail(text);

  return `
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:24px 0;">
        <a href="${escapeHtmlForEmail(url)}"
           style="display:inline-block;
                  background-color:#00A99D;
                  color:#ffffff;
                  font-size:15px;
                  font-weight:600;
                  text-decoration:none;
                  padding:14px 32px;
                  border-radius:8px;
                  letter-spacing:0.2px;">
          ${safeText}
        </a>
      </td>
    </tr>
  </table>`;
}

export function divider(): string {
  return `<hr style="border:none;border-top:
    1px solid #e8ecf0;margin:24px 0;">`;
}

export function bodyText(text: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;
    color:#374151;line-height:1.6;">${escapeHtmlForEmail(text)}</p>`;
}

/** Pass plain text strings; HTML is escaped before wrapping in layout. */
export function bulletList(items: string[]): string {
  const listItems = items
    .map(
      (item) => `
    <tr>
      <td style="padding:4px 0;">
        <table cellpadding="0" cellspacing="0">
          <tr>
            <td style="width:20px;vertical-align:top;
                       padding-top:2px;">
              <div style="width:6px;height:6px;
                          border-radius:50%;
                          background-color:#00A99D;
                          margin-top:6px;">
              </div>
            </td>
            <td style="font-size:14px;color:#374151;
                       line-height:1.6;">${escapeHtmlForEmail(item)}</td>
          </tr>
        </table>
      </td>
    </tr>`,
    )
    .join('');

  return `<table width="100%" cellpadding="0"
    cellspacing="0" style="margin:8px 0 16px;">
    ${listItems}
  </table>`;
}

/** Safe HTML snippet (e.g. generated from escaped user note). Wrap notes with this sparingly. */
export function htmlBlock(html: string): string {
  return html;
}
