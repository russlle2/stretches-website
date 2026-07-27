const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  convertInchesToTwip
} = require('docx');
const fs = require('fs');
const path = require('path');

const GREEN = '10b981';
const BLACK = '050505';
const LGRAY = 'F4F4F4';
const DGRAY = '444444';
const WHITE = 'FFFFFF';

const bold = (t, sz = 22, color = BLACK) => new TextRun({ text: t, bold: true, size: sz, color });
const normal = (t, sz = 22, color = DGRAY) => new TextRun({ text: t, size: sz, color });
const green = (t, sz = 22) => new TextRun({ text: t, bold: true, size: sz, color: GREEN });
const mono = (t, sz = 20, color = '1a3c6b') => new TextRun({ text: t, font: 'Courier New', size: sz, color });

function heading1(text) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 40, color: BLACK, font: 'Calibri' })],
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 120 },
    border: { bottom: { color: GREEN, size: 6, style: BorderStyle.SINGLE } },
  });
}
function heading2(text) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 28, color: GREEN, font: 'Calibri' })],
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 80 },
  });
}
function body(runs) {
  return new Paragraph({
    children: Array.isArray(runs) ? runs : [normal(runs)],
    spacing: { after: 100 },
  });
}
function numbered(text) {
  return new Paragraph({
    children: [normal(text, 22, DGRAY)],
    numbering: { reference: 'default', level: 0 },
    spacing: { after: 80 },
  });
}
function bullet(text) {
  return new Paragraph({
    children: [normal(text, 22, DGRAY)],
    bullet: { level: 0 },
    spacing: { after: 80 },
  });
}
function divider() {
  return new Paragraph({
    children: [],
    border: { bottom: { color: 'CCCCCC', size: 4, style: BorderStyle.SINGLE } },
    spacing: { before: 160, after: 160 },
  });
}
function sp() {
  return new Paragraph({ children: [new TextRun('')], spacing: { after: 60 } });
}
function infoBox(label, value) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [bold(label, 20, WHITE)], spacing: { before: 60, after: 60 }, indent: { left: 100 } })],
            shading: { type: ShadingType.SOLID, color: GREEN, fill: GREEN },
            width: { size: 28, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            children: [new Paragraph({ children: [mono(value, 22)], spacing: { before: 60, after: 60 }, indent: { left: 100 } })],
            shading: { type: ShadingType.SOLID, color: LGRAY, fill: LGRAY },
            width: { size: 72, type: WidthType.PERCENTAGE },
          }),
        ],
      }),
    ],
  });
}

const doc = new Document({
  numbering: {
    config: [{
      reference: 'default',
      levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 440, hanging: 260 } } } }],
    }],
  },
  styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
  sections: [{
    properties: { page: { margin: { top: 1080, bottom: 1080, left: 1260, right: 1260 } } },
    children: [
      new Paragraph({
        children: [new TextRun({ text: 'GMF Productions', bold: true, size: 64, color: BLACK })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 480, after: 80 },
      }),
      new Paragraph({
        children: [green('Site Editor — Simple Guide', 36)],
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
      }),
      new Paragraph({
        children: [normal('For: GMF Productions  ·  Prepared by: Chris', 20, '888888')],
        alignment: AlignmentType.CENTER,
        spacing: { after: 480 },
      }),
      divider(),

      heading1('1. How to Sign In'),
      sp(),
      infoBox('Editor address', 'https://gmfproductions904.com/admin'),
      sp(),
      infoBox('Your email', 'gmfstr3tch@gmail.com'),
      sp(),
      infoBox('Password', 'The password you created from the invite email'),
      sp(),
      numbered('Open https://gmfproductions904.com/admin on your phone or computer.'),
      numbered('Click Sign In.'),
      numbered('Enter your email and password.'),
      numbered('You will see big green buttons on the left — that is your dashboard.'),
      sp(),
      body([bold('Forgot password? '), normal('On the login screen click Forgot password and check your Gmail.')]),
      divider(),

      heading1('2. What You Will See'),
      body('The left side has clear tasks. Click one, make your changes, then click the green Save & Publish button. The website rebuilds by itself — usually live in about 90 seconds. You do not need to know anything about code, Git, or Stripe.'),
      sp(),
      bullet('Change Prices — tee, shorts, and hat prices in dollars'),
      bullet('Edit Catalog — product names, taglines, which items a design appears on, upload artwork'),
      bullet('Featured Video & Music — paste a YouTube link, edit tracks'),
      bullet('Homepage Text — hero headline, about story, merch heading'),
      bullet('Shop / About / Booking / Contact Text — page wording'),
      bullet('Policies — shipping and returns'),
      bullet('Site Settings — announcement bar at the top of pages, support email, social links'),
      bullet('Background & Homepage Merch — site background image + the 3 products on the home page'),
      bullet('Add a New Page — create a News or Promo page'),
      bullet('Preview Site — opens your live website'),
      divider(),

      heading1('3. Change Prices (most common)'),
      numbered('Click Change Prices.'),
      numbered('Type the new price in dollars. Example: type 30 for $30.00. Do not type a dollar sign.'),
      numbered('Click Save & Publish.'),
      numbered('Wait about 90 seconds, then refresh the shop page to see the new price.'),
      body([bold('Important: '), normal('Changing a price updates the store and the Stripe checkout automatically.')]),
      divider(),

      heading1('4. Edit Catalog'),
      numbered('Click Edit Catalog.'),
      numbered('Click a design name to open it.'),
      numbered('Change the Product name or Tagline.'),
      numbered('Choose how the image should appear: Stock designs (placed on black tee/shorts/hat photos), Colored background (artwork on a solid color, not on clothes), or Use image as-is (your upload becomes the product photo with no auto-placement).'),
      numbered('If you picked Colored background, choose the background color.'),
      numbered('Check or uncheck T-Shirt / Shorts / Hat for which products this design sells as.'),
      numbered('Optional: choose a new image file to replace the artwork.'),
      numbered('Click Save & Publish.'),
      body('To add a brand-new design, click Add New Design, give it a name, pick an appearance mode, upload an image, and Save & Publish.'),
      body([
        bold('Important: '),
        normal('Uploads are not forced onto black clothes anymore. Pick Stock designs only when you want that look.'),
      ]),
      divider(),

      heading1('5. Change the Featured Video'),
      numbered('Click Featured Video & Music.'),
      numbered('Paste any YouTube link into Featured YouTube video (the editor pulls out the ID for you).'),
      numbered('Update the title and subtitle if you want.'),
      numbered('Edit Top Tracks the same way.'),
      numbered('Click Save & Publish.'),
      divider(),

      heading1('6. Background & Homepage Merch'),
      body('Use this to change the look of the site and the three products shown on the home page Official Merch section.'),
      sp(),
      numbered('Click Background & Homepage Merch.'),
      numbered('Upload a JPG or PNG for the background (preferred). Or paste a direct image URL.'),
      numbered('Leave “Also use this image as a soft look across the whole website” checked if you want the same vibe on every page.'),
      numbered('For each of the 3 slots, pick a real product from the dropdown. You can change the display name, price, or upload a custom photo.'),
      numbered('Click Save & Publish. Wait about 90 seconds, then refresh the home page.'),
      body([
        bold('Important: '),
        normal('iCloud, Google Drive, Dropbox, and Canva share links will not work. Always Upload a real image file.'),
      ]),
      divider(),

      heading1('7. Edit Words on Pages'),
      numbered('Click Homepage Text, Shop Page Text, About Page, Booking Text, or Contact Text.'),
      numbered('Change the headings and paragraphs.'),
      numbered('Click Save & Publish.'),
      body('Fonts and layout stay the same — you only change the words.'),
      divider(),

      heading1('8. Add a News or Promo Page'),
      numbered('Click Add a New Page.'),
      numbered('Choose News / Blog or Promo.'),
      numbered('Fill in Title, Short summary, and Body text.'),
      numbered('Optional: paste a YouTube link or image URL.'),
      numbered('Click Create & Publish.'),
      numbered('Find it later at https://gmfproductions904.com/news'),
      divider(),

      heading1('9. Rules to Remember'),
      bullet('Always click Save & Publish when you are done.'),
      bullet('Prices are dollars only — 25 means $25.00.'),
      bullet('Paste full YouTube links; you do not need to find the ID yourself.'),
      bullet('For backgrounds, upload a JPG/PNG — share links (iCloud/Drive/Canva) will not show on the site.'),
      bullet('If Save fails with a Git Gateway error, tell Chris — that setting lives in Netlify.'),
      bullet('After saving, wait ~90 seconds before checking the live site.'),
      divider(),

      heading1('10. Need Help?'),
      body([normal('Email Chris: '), mono('christopherlake96@gmail.com')]),
      body([normal('Support inbox: '), mono('support@gmfproductions904.com')]),
      body([normal('Website: '), mono('https://gmfproductions904.com')]),
      body([normal('Editor: '), mono('https://gmfproductions904.com/admin')]),
      sp(),
      new Paragraph({
        children: [normal("GMF Productions  ·  GETTIN' MONEY FOREVER", 18, 'AAAAAA')],
        alignment: AlignmentType.CENTER,
        spacing: { before: 240 },
      }),
    ],
  }],
});

Packer.toBuffer(doc).then((buf) => {
  const out = path.join(__dirname, '..', 'GMF-Productions-Editor-Guide.docx');
  fs.writeFileSync(out, buf);
  console.log('Saved:', out);
});
