import config from './config.js';

function generateQuotationNumber() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '#';
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function formatDate(date) {
  const d = date || new Date();
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

function formatValidUntil(date) {
  const d = date || new Date();
  d.setMonth(d.getMonth() + 1);
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

function generateCustomerId() {
  return `7-${Math.floor(100 + Math.random() * 900)}`;
}

function escapeLatex(text) {
  return String(text)
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/[&%$#_{}]/g, m => '\\' + m)
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
}

function buildItemRows(items) {
  return items.map(item => {
    const desc = escapeLatex(item.description);
    const qty = escapeLatex(item.quantity || 'X1');
    const price = escapeLatex(item.price || 'Nil');
    const total = escapeLatex(item.total || item.price || 'Nil');
    return `${desc} & ${qty} & Rs. ${price} & Rs. ${total} \\\\`;
  }).join('\n\\hline\n');
}

function buildLatex({
  quotationNo,
  date,
  validUntil,
  customerId,
  clientName,
  clientAddress,
  clientContact,
  projectDescription,
  items,
  subtotal,
  vat,
  others,
  total,
}) {
  return `\\documentclass[a4paper,11pt]{article}
\\usepackage[margin=1.5cm]{geometry}
\\usepackage[dvipsnames]{xcolor}
\\usepackage{array}
\\usepackage{booktabs}
\\usepackage{tabularx}
\\usepackage{colortbl}

\\definecolor{stratixblue}{RGB}{0,90,180}
\\pagestyle{empty}

\\begin{document}

\\begin{minipage}[t]{0.45\\textwidth}
{\\Large \\textbf{STRATIX}}\\\\[2pt]
{\\small \\textit{the strategy for your brand}}
\\end{minipage}%
\\hfill
\\begin{minipage}[t]{0.50\\textwidth}
\\raggedleft
{\\small Mararikulam, Alappuzha, Kerala-688521}\\\\
{\\small +91-9895 122 752}\\\\
{\\small www.stratixagency.site}
\\end{minipage}

\\vspace{0.3cm}
\\hrule
\\vspace{0.5cm}

\\begin{center}
{\\LARGE \\textcolor{stratixblue}{\\textbf{QUOTATION}}}
\\end{center}

\\vspace{0.5cm}

\\begin{minipage}[t]{0.48\\textwidth}
{\\textbf{Quotation no:} ${escapeLatex(quotationNo)}}\\\\[3pt]
{\\textbf{Date:} ${escapeLatex(date)}}\\\\[3pt]
{\\textbf{Valid Until:} ${escapeLatex(validUntil)}}\\\\[3pt]
{\\textbf{Customer Id:} ${escapeLatex(customerId)}}
\\end{minipage}%
\\hfill
\\begin{minipage}[t]{0.48\\textwidth}
{\\textbf{Client Name:} ${escapeLatex(clientName)}}\\\\[3pt]
{\\textbf{Address:} ${escapeLatex(clientAddress)}}\\\\[3pt]
{\\textbf{Contact:} ${escapeLatex(clientContact)}}
\\end{minipage}

\\vspace{0.5cm}
\\hrule
\\vspace{0.5cm}

{\\textcolor{stratixblue}{\\textbf{PROJECT DESCRIPTION}}}
\\vspace{0.3cm}

${escapeLatex(projectDescription)}

\\vspace{0.5cm}

\\begin{center}
\\begin{tabularx}{\\textwidth}{
  >{\\raggedright\\arraybackslash}X
  >{\\centering\\arraybackslash}p{2cm}
  >{\\raggedleft\\arraybackslash}p{2.5cm}
  >{\\raggedleft\\arraybackslash}p{2.5cm}
}
\\hline
\\rowcolor{stratixblue}
\\textcolor{white}{\\textbf{Description}} &
\\textcolor{white}{\\textbf{Quantity}} &
\\textcolor{white}{\\textbf{Price}} &
\\textcolor{white}{\\textbf{Total}} \\\\
\\hline
${buildItemRows(items)}
\\hline
\\end{tabularx}
\\end{center}

\\vspace{0.3cm}
\\begin{flushright}
\\begin{tabular}{lr}
Subtotal & Rs. ${escapeLatex(subtotal)} \\\\
Value Added Tax & ${escapeLatex(vat)} \\\\
Others & ${escapeLatex(others)} \\\\
\\hline
\\textbf{Total} & \\textbf{Rs. ${escapeLatex(total)}} \\\\
\\end{tabular}
\\end{flushright}

\\vspace{0.5cm}
\\hrule
\\vspace{0.3cm}

{\\textcolor{stratixblue}{\\textbf{TERMS \\& CONDITIONS}}}
\\vspace{0.2cm}

{\\small Above information is not an invoice and only an estimate of goods/services. Payment will be due prior to provision or delivery of goods/services.}

\\vspace{0.3cm}

\\begin{center}
\\fcolorbox{stratixblue}{stratixblue}{\\parbox{0.6\\textwidth}{\\centering \\textcolor{white}{\\textbf{Please confirm your acceptance of this quote}}}}
\\end{center}

\\vspace{1.5cm}

\\begin{minipage}[t]{0.45\\textwidth}
\\hrule
{\\small Signature over printed name}
\\end{minipage}%
\\hfill
\\begin{minipage}[t]{0.45\\textwidth}
\\hrule
{\\small Date Signed}
\\end{minipage}

\\end{document}`;
}

async function renderLatexToPdf(latex) {
  const response = await fetch('https://latex.ytotech.com/builds/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      compiler: 'pdflatex',
      resources: [{ main: true, content: latex }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`LaTeX render ${response.status}: ${err}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await response.json();
    if (!data.pdf) throw new Error('No PDF in response');
    return Buffer.from(data.pdf, 'base64');
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer[0] !== 0x25 || buffer[1] !== 0x50) {
    throw new Error('Response is not a valid PDF');
  }
  return buffer;
}

export async function generateQuotePdf({
  clientName = 'Client',
  clientAddress = 'Address pending',
  clientContact = 'Contact pending',
  projectDescription = 'Digital services',
  items = [],
  subtotal = '0',
  vat = '0',
  others = '0',
  total = '0',
}) {
  const now = new Date();

  const latex = buildLatex({
    quotationNo: generateQuotationNumber(),
    date: formatDate(now),
    validUntil: formatValidUntil(new Date(now)),
    customerId: generateCustomerId(),
    clientName,
    clientAddress,
    clientContact,
    projectDescription,
    items,
    subtotal,
    vat,
    others,
    total,
  });

  console.log('[Invoice] Rendering PDF...');
  const pdfBuffer = await renderLatexToPdf(latex);
  console.log('[Invoice] PDF generated successfully');
  return pdfBuffer;
}

export async function generateQuoteFromConversation(chatId, serviceName, amount, clientName) {
  const items = [];

  switch (serviceName.toLowerCase()) {
    case 'website':
    case 'website package':
      items.push(
        { description: 'Professional Website Design & Development', quantity: 'X1', price: '14,000', total: '14,000' },
        { description: '3 Months SEO Support', quantity: 'X1', price: '4,000', total: '4,000' },
        { description: 'UI/UX Design + Responsive Layout', quantity: 'X1', price: '2,000', total: '2,000' }
      );
      break;
    case 'website + ai':
    case 'website+ai':
    case 'website with ai':
    case 'ai website':
    case 'website + ai package':
      items.push(
        { description: 'Professional Website Design & Development', quantity: 'X1', price: '20,000', total: '20,000' },
        { description: '6 Months SEO Support', quantity: 'X1', price: '8,000', total: '8,000' },
        { description: 'AI Chatbot Integration', quantity: 'X1', price: '5,000', total: '5,000' },
        { description: 'WhatsApp Business Integration', quantity: 'X1', price: '2,000', total: '2,000' }
      );
      break;
    case 'ecommerce':
    case 'ecommerce + ai':
    case 'ecommerce website':
      items.push(
        { description: 'Ecommerce Website Development', quantity: 'X1', price: '30,000', total: '30,000' },
        { description: 'AI Integration + Custom Features', quantity: 'X1', price: '15,000', total: '15,000' },
        { description: 'Payment Gateway Setup', quantity: 'X1', price: '5,000', total: '5,000' },
        { description: '6 Months SEO + Marketing Support', quantity: 'X1', price: '5,000', total: '5,000' }
      );
      break;
    case 'ai automation':
    case 'automation':
    case 'messaging automation':
    case 'whatsapp automation':
      items.push(
        { description: 'AI Sales Agent Setup', quantity: 'X1', price: '3,000', total: '3,000' },
        { description: 'WhatsApp Messaging Automation (250 msgs/mo)', quantity: 'X1', price: '2,000', total: '2,000' },
        { description: 'Monthly Maintenance & Support', quantity: '1 mo', price: '1,000', total: '1,000' }
      );
      break;
    case 'marketing':
    case 'meta ads':
    case 'digital marketing':
      items.push(
        { description: 'Meta/Facebook Ads Management', quantity: '1 mo', price: '8,000', total: '8,000' },
        { description: 'Social Media Content & Management', quantity: '1 mo', price: '4,000', total: '4,000' },
        { description: 'Campaign Analytics & Reporting', quantity: '1 mo', price: '3,000', total: '3,000' }
      );
      break;
    default:
      items.push(
        { description: 'Custom Project - ' + (serviceName || 'Digital Services'), quantity: 'X1', price: amount || 'TBD', total: amount || 'TBD' }
      );
  }

  const subtotalNum = items.reduce((sum, item) => {
    const p = parseInt(item.price.replace(/,/g, ''), 10);
    return sum + (isNaN(p) ? 0 : p);
  }, 0);

  return generateQuotePdf({
    clientName: clientName || 'Client',
    clientAddress: 'Address to be confirmed',
    clientContact: 'Contact to be confirmed',
    projectDescription: `${serviceName} - Stratix Agency Digital Services`,
    items,
    subtotal: subtotalNum.toLocaleString('en-IN'),
    vat: '0',
    others: '400',
    total: (subtotalNum + 400).toLocaleString('en-IN'),
  });
}
