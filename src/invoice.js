import config from './config.js';

const INVOICE_LATEX_TEMPLATE = `\\documentclass[a4paper,11pt]{article}
\\usepackage[margin=1.5cm]{geometry}
\\usepackage{graphicx}
\\usepackage{xcolor}
\\usepackage{tabularx}
\\usepackage{colortbl}
\\usepackage{array}
\\usepackage{fancyhdr}
\\usepackage{fontenc}
\\usepackage[utf8]{inputenc}

\\definecolor{stratixblue}{RGB}{0,90,180}
\\definecolor{lightgray}{RGB}{240,240,240}

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
{\\textbf{Quotation no:} #QUOTATION_NO}\\\\[3pt]
{\\textbf{Date:} #DATE}\\\\[3pt]
{\\textbf{Valid Until:} #VALID_UNTIL}\\\\[3pt]
{\\textbf{Customer Id:} #CUSTOMER_ID}
\\end{minipage}%
\\hfill
\\begin{minipage}[t]{0.48\\textwidth}
{\\textbf{Client Name:} #CLIENT_NAME}\\\\[3pt]
{\\textbf{Address:} #CLIENT_ADDRESS}\\\\[3pt]
{\\textbf{Contact:} #CLIENT_CONTACT}
\\end{minipage}

\\vspace{0.5cm}
\\hrule
\\vspace{0.5cm}

{\\textcolor{stratixblue}{\\textbf{PROJECT DESCRIPTION}}}
\\vspace{0.3cm}

#PROJECT_DESCRIPTION

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
#ITEMS
\\hline
\\end{tabularx}
\\end{center}

\\vspace{0.3cm}
\\begin{flushright}
\\begin{tabular}{lr}
Subtotal & Rs. #SUBTOTAL \\\\
Value Added Tax & #VAT \\\\
Others & #OTHERS \\\\
\\hline
\\textbf{Total} & \\textbf{Rs. #TOTAL} \\\\
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
  const num = Math.floor(100 + Math.random() * 900);
  return `7-${num}`;
}

function generateItemRows(items) {
  return items.map(item => {
    const price = item.price || 'Nil';
    const total = item.total || item.price || 'Nil';
    const qty = item.quantity || 'X1';
    return `${item.description} & ${qty} & Rs. ${price} & Rs. ${total} \\\\`;
  }).join('\n\\hline\n');
}

async function callOpenRouterForLaTeX(prompt, apiKey, model) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://stratixagency.site',
      'X-Title': 'Stratix Agency Invoice',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: `You are a professional quotation generator for Stratix Agency. Generate clean LaTeX code for a quotation/invoice.

RULES:
- Output ONLY valid LaTeX code, no markdown, no backticks, no explanations
- Use the stratixblue color (RGB 0,90,180) for headers and highlights
- Include company header: STRATIX (large, bold) with tagline "the strategy for your brand"
- Company details: Mararikulam, Alappuzha, Kerala-688521, +91-9895 122 752, www.stratixagency.site
- Generate a professional QUOTATION (not invoice)
- Include: quotation number, date, valid until (1 month from now), customer id
- Table with Description, Quantity, Price, Total columns
- Subtotal, VAT (0), Others (small rounding), Total in INR
- Terms: "Above information is not an invoice and only an estimate of goods/services. Payment will be due prior to provision or delivery of goods/services."
- Blue bordered box: "Please confirm your acceptance of this quote"
- Signature lines at bottom

OUTPUT: Complete LaTeX document starting with \\documentclass and ending with \\end{document}`
        },
        {
          role: 'user',
          content: prompt,
        }
      ],
      max_tokens: 2048,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenRouter LaTeX ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function renderLatexToPdf(latex) {
  const response = await fetch('https://latex.ytotech.com/builds/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      compiler: 'pdflatex',
      resources: [
        {
          main: true,
          content: latex,
        }
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`LaTeX render ${response.status}: ${err}`);
  }

  // API returns raw PDF bytes, not JSON
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await response.json();
    if (!data.pdf) throw new Error('No PDF in response');
    return Buffer.from(data.pdf, 'base64');
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Verify it's a PDF
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
  // Generate LaTeX via OpenRouter
  const prompt = `Generate a quotation for:
Client: ${clientName}
Address: ${clientAddress}
Contact: ${clientContact}
Project: ${projectDescription}
Items: ${items.map(i => `${i.description} - Rs.${i.price}`).join(', ')}
Total: Rs.${total}
Subtotal: Rs.${subtotal}
Others: Rs.${others}
VAT: Rs.${vat}`;

  console.log('[Invoice] Generating LaTeX...');
  const latex = await callOpenRouterForLaTeX(prompt, config.openrouterInvoiceKey, config.invoiceModel);

  // Clean up LaTeX if wrapped in markdown
  let cleanLatex = latex;
  if (cleanLatex.includes('```')) {
    cleanLatex = cleanLatex.replace(/```latex?\n?/g, '').replace(/```\n?/g, '');
  }
  cleanLatex = cleanLatex.trim();

  console.log('[Invoice] Rendering PDF...');
  const pdfBuffer = await renderLatexToPdf(cleanLatex);

  console.log('[Invoice] PDF generated successfully');
  return pdfBuffer;
}

export async function generateQuoteFromConversation(chatId, serviceName, amount, clientName) {
  const items = [];
  const now = new Date();

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
    case 'website with ai':
    case 'ai website':
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
        { description: 'Custom Project - ' + (projectDescription || 'Digital Services'), quantity: 'X1', price: amount || 'TBD', total: amount || 'TBD' }
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
