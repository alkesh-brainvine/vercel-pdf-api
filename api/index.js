// Force AWS Lambda / Vercel environment detection for @sparticuz/chromium
process.env.AWS_LAMBDA_JS_RUNTIME = 'nodejs20.x';

const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');
const path = require('path');

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed. Use POST and send HTML.' });
    }

    let html = req.body;
    
    // If sent as JSON { html: "..." }
    if (typeof req.body === 'object' && req.body.html) {
        html = req.body.html;
    }

    if (!html) {
        return res.status(400).json({ error: 'No HTML provided in request body.' });
    }

    let browser = null;
    try {
        // Optimized settings for Vercel Hobby Tier (1024MB Memory, 10s execution)
        chromium.setHeadlessMode = true;
        chromium.setGraphicsMode = false;

        const executablePath = await chromium.executablePath();

        browser = await puppeteer.launch({
            args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
            defaultViewport: chromium.defaultViewport,
            executablePath: executablePath,
            headless: chromium.headless,
        });

        const page = await browser.newPage();
        
        // Disable unnecessary requests for speed
        await page.setRequestInterception(true);
        page.on('request', req => {
            if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
                req.continue(); // allow images, fonts and css
            } else {
                req.continue();
            }
        });

        await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15000 });
        
        // Attempt to wait for Webfonts
        await page.evaluateHandle('document.fonts.ready');

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '0', right: '0', bottom: '0', left: '0' },
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="document.pdf"');
        res.setHeader('Cache-Control', 's-maxage=31536000, stale-while-revalidate');
        
        res.status(200).send(pdfBuffer);

    } catch (error) {
        console.error('Error generating PDF:', error);
        res.status(500).json({ error: 'Error generating PDF', details: error.message });
    } finally {
        if (browser !== null) {
            await browser.close();
        }
    }
};
