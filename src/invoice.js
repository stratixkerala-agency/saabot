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
  const serviceLower = serviceName.toLowerCase().replace(/\s+/g, ' ').trim();

  // Handle composite services like "website+marketing" or "website + marketing"
  const compositeParts = serviceLower.split(/\s*(?:\+|&|and)\s*/);
  
  // If multiple services, look up each one separately
  if (compositeParts.length > 1) {
    for (const part of compositeParts) {
      const partItems = getItemsForService(part.trim());
      items.push(...partItems);
    }
  } else {
    items.push(...getItemsForService(serviceLower));
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
    others: '0',
    total: subtotalNum.toLocaleString('en-IN'),
  });
}

function getItemsForService(serviceName) {
  const items = [];
  const s = serviceName.toLowerCase().replace(/\s+/g, ' ').trim();

  switch (s) {
    case 'website':
    case 'basic website':
    case 'website package':
      items.push(
        { description: 'Professional Website Design & Development', quantity: 'X1', price: '20,000', total: '20,000' }
      );
      break;
    case 'website + ai':
    case 'website+ai':
    case 'website with ai':
    case 'ai website':
      items.push(
        { description: 'Professional Website Design & Development', quantity: 'X1', price: '20,000', total: '20,000' },
        { description: 'AI Integration & Automation Setup', quantity: 'X1', price: '15,000', total: '15,000' }
      );
      break;
    case 'website + marketing':
    case 'website+marketing':
    case 'website and marketing':
    case 'website & marketing':
      items.push(
        { description: 'Professional Website Design & Development', quantity: 'X1', price: '20,000', total: '20,000' },
        { description: 'Digital Marketing Package', quantity: 'X1', price: '20,000', total: '20,000' }
      );
      break;
    case 'video production + marketing':
    case 'video + marketing':
    case 'video production + digital marketing':
      items.push(
        { description: 'Video Production Package', quantity: 'X1', price: '15,000', total: '15,000' },
        { description: 'Digital Marketing Package', quantity: 'X1', price: '20,000', total: '20,000' }
      );
      break;
    case 'video production + marketing + website':
    case 'video + marketing + website':
    case 'website + video production + marketing':
    case 'website + video + marketing':
      items.push(
        { description: 'Professional Website Design & Development', quantity: 'X1', price: '20,000', total: '20,000' },
        { description: 'Video Production Package', quantity: 'X1', price: '15,000', total: '15,000' },
        { description: 'Digital Marketing Package', quantity: 'X1', price: '20,000', total: '20,000' }
      );
      break;
    case 'ecommerce':
    case 'ecommerce website':
    case 'ecommerce + ai':
      items.push(
        { description: 'Ecommerce Website Development', quantity: 'X1', price: '30,000', total: '30,000' },
        { description: 'Payment Gateway & Product Setup', quantity: 'X1', price: '10,000', total: '10,000' }
      );
      break;
    case 'digital marketing':
    case 'marketing':
    case 'meta ads':
    case 'facebook ads':
      items.push(
        { description: 'Digital Marketing Package', quantity: 'X1', price: '20,000', total: '20,000' }
      );
      break;
    case 'branding':
      items.push(
        { description: 'Branding Package', quantity: 'X1', price: '15,000', total: '15,000' }
      );
      break;
    case 'video production':
    case 'video':
      items.push(
        { description: 'Video Production Package', quantity: 'X1', price: '15,000', total: '15,000' }
      );
      break;
    case 'graphic designing':
    case 'graphic design':
    case 'graphics':
      items.push(
        { description: 'Graphic Designing Package', quantity: 'X1', price: '15,000', total: '15,000' }
      );
      break;
    case 'ai':
    case 'ai services':
    case 'ai integration':
      items.push(
        { description: 'AI Integration & Setup', quantity: 'X1', price: '15,000', total: '15,000' }
      );
      break;
    case 'ai automation':
    case 'automation':
      items.push(
        { description: 'AI Automation Setup', quantity: 'X1', price: '15,000', total: '15,000' }
      );
      break;
    case 'whatsapp automation':
    case 'whatsapp bot':
    case 'messaging automation':
      items.push(
        { description: 'WhatsApp Automation (250 msgs/mo)', quantity: 'X1', price: '6,000', total: '6,000' }
      );
      break;
    case 'saas':
    case 'custom saas':
    case 'ai workflows':
    case 'ai hardware':
    case 'saas + ai':
      items.push(
        { description: 'Custom SaaS / AI Workflow / AI Hardware', quantity: 'X1', price: '30,000', total: '30,000' }
      );
      break;
    case 'seo':
    case 'search engine optimization':
      items.push(
        { description: 'SEO Optimization Package', quantity: 'X1', price: '15,000', total: '15,000' }
      );
      break;
    default:
      items.push(
        { description: 'Custom Project - ' + (serviceName || 'Digital Services'), quantity: 'X1', price: 'TBD', total: 'TBD' }
      );
  }
  return items;
}
