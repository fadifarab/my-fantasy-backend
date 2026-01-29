const puppeteer = require('puppeteer');
const axios = require('axios');
const FormData = require('form-data');

// دالة الالتقاط الرئيسية المطورة
async function captureScreenshot(type, gw, userToken, teamId = null) {
  const FRONTEND_URL = process.env.FRONTEND_URL || 'https://fpl-zeddine.vercel.app';
  let browser;

  try {
    const browserlessToken = process.env.BROWSERLESS_TOKEN || '2TrS5mYdRmu4pyR91ac97d1ed53b2f26f6822d8f62510b2eb';
    
    // الاتصال بالمتصفح السحابي لضمان الاستقرار
    browser = await puppeteer.connect({
      browserWSEndpoint: `wss://chrome.browserless.io?token=${browserlessToken}`,
    });

    const page = await browser.newPage();

    // تحديد العرض: الجداول تحتاج 950px، التشكيلات والنتائج تحتاج 1400px
    const isStandings = (type === 'league' || type === 'standings');
    const viewWidth = isStandings ? 950 : 1400;

    await page.setViewport({
      width: viewWidth,
      height: 1200,
      deviceScaleFactor: 3 
    });

    // حقن التوكن في الهيدرز والـ LocalStorage
    if (userToken) {
      await page.setExtraHTTPHeaders({ 'Authorization': `Bearer ${userToken}` });
    }

    await page.goto(FRONTEND_URL, { waitUntil: 'networkidle0', timeout: 60000 });
    if (userToken) {
      await page.evaluate((token) => {
        localStorage.setItem('userInfo', JSON.stringify({ token, timestamp: Date.now() }));
        // حقن كائن المستخدم الكامل لضمان المصادقة في كل الصفحات
        const userObject = { _id: '6958141eb9878d54b9151bc0', role: 'admin', token: token };
        localStorage.setItem('user', JSON.stringify(userObject));
      }, userToken);
    }

    // بناء الرابط المستهدف
    let targetUrl;
    if (type === 'lineups' || type === 'team-history') {
      const id = teamId || '695823deb446037eeae9113a';
      targetUrl = `${FRONTEND_URL}/team-history/${id}?mode=capture&gw=${gw}`;
    } else {
      targetUrl = `${FRONTEND_URL}/${type}?mode=capture&gw=${gw}`;
    }

    await page.goto(targetUrl, { waitUntil: 'networkidle0', timeout: 60000 });
    await new Promise(r => setTimeout(r, 5000)); // انتظار تحميل الصور والأقمصة

    // 🔥 التنسيق الذكي: يفرق بين الجداول والملعب والنتائج
    await page.evaluate((contentType) => {
      const style = document.createElement('style');
      let css = `
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@700;900&display=swap');
        body { background: white !important; font-family: 'Cairo', sans-serif !important; direction: rtl !important; }
        nav, footer, .sidebar, button, .no-print, [class*="back-btn"], header { display: none !important; }
      `;

      if (contentType === 'league' || contentType === 'standings') {
        css += `
          body, .container { width: 950px !important; padding: 10px !important; }
          td, th, td *, th *, span, div { font-size: 28px !important; font-weight: 800 !important; }
          table { width: 100% !important; border-collapse: collapse !important; }
        `;
      } else if (contentType === 'fixtures' || contentType === 'matches') {
        css += `
          body { width: 1250px !important; padding: 30px !important; }
          .fixtures-container, [class*="match"], .match-row { display: flex !important; visibility: visible !important; opacity: 1 !important; }
        `;
      } else {
        // تنسيق التشكيلات (الملعب)
        css += `
          body { width: 1400px !important; padding: 20px !important; }
          .pitch-fade-in, .team-lineup, [class*="pitch"] { display: block !important; visibility: visible !important; opacity: 1 !important; }
        `;
      }
      style.innerHTML = css;
      document.head.appendChild(style);
    }, type);

    await new Promise(r => setTimeout(r, 2000));
    const bodyHeight = await page.evaluate(() => document.documentElement.scrollHeight);

    return await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: viewWidth, height: bodyHeight }
    });

  } finally {
    if (browser) await browser.close();
  }
}