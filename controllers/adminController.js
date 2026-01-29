const puppeteer = require('puppeteer');
const axios = require('axios');
const FormData = require('form-data');

async function captureScreenshot(type, gw, userToken, teamId = null) {
  const FRONTEND_URL = process.env.FRONTEND_URL || 'https://fpl-zeddine.vercel.app';
  const browserlessToken = process.env.BROWSERLESS_TOKEN || '2TrS5mYdRmu4pyR91ac97d1ed53b2f26f6822d8f62510b2eb';
  let browser;

  try {
    // 1. الاتصال بمتصفح سحابي (الحل الوحيد المستقر لـ Render)
    browser = await puppeteer.connect({
      browserWSEndpoint: `wss://chrome.browserless.io?token=${browserlessToken}`,
    });

    const page = await browser.newPage();

    // 🛡️ الضربة الاستباقية: حقن الهوية الكاملة قبل أي تحميل
    await page.evaluateOnNewDocument((token) => {
      const userObject = {
        _id: '6958141eb9878d54b9151bc0',
        username: 'NEW Ayhem', 
        email: 'admin@example.com',
        role: 'admin',
        leagueId: '69581438b9878d54b9151be1',
        teamId: '695823deb446037eeae9113a',
        token: token,
        isAuthenticated: true
      };
      localStorage.setItem('user', JSON.stringify(userObject));
      localStorage.setItem('token', token);
      localStorage.setItem('userInfo', JSON.stringify({ token, timestamp: Date.now() }));
      localStorage.setItem('isAuthenticated', 'true');
    }, userToken);

    // حقن الكوكيز السحابية
    const domain = new URL(FRONTEND_URL).hostname;
    await page.setCookie({ name: 'token', value: userToken, domain: domain, path: '/' });
    await page.setExtraHTTPHeaders({ 'Authorization': `Bearer ${userToken}`, 'X-Auth-Token': userToken });

    // تحديد العرض (الجداول 950، النتائج 1200، الملعب 1400)
    const isStandings = (type === 'league' || type === 'standings');
    const viewWidth = isStandings ? 950 : (type === 'fixtures' || type === 'matches' ? 1200 : 1400);

    await page.setViewport({ width: viewWidth, height: 1200, deviceScaleFactor: 3 });

    // 🎯 توجيه المسارات المعتمد (من كودك الناجح)
    let targetUrl;
    if (type === 'dream-team' || type === 'dream-team-gw' || type === 'awards-gw') {
      targetUrl = `${FRONTEND_URL}/awards?mode=capture&tab=gameweek&gw=${gw}`;
    } else if (type === 'dream-team-month' || type === 'awards-month') {
      targetUrl = `${FRONTEND_URL}/awards?mode=capture&tab=month&range=${gw}`;
    } else if (type === 'lineups' || type === 'formation' || type === 'team-history') {
      const finalTeamId = teamId || '695823deb446037eeae9113a';
      targetUrl = `${FRONTEND_URL}/team-history/${finalTeamId}?mode=capture&gw=${gw}`;
    } else {
      targetUrl = `${FRONTEND_URL}/${type}?mode=capture&gw=${gw}`;
    }

    await page.goto(targetUrl, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForSelector('body', { timeout: 15000 });

    // انتظار ذكي للعناصر الرسومية (الملعب والأطقم)
    if (type.includes('dream-team') || type.includes('awards') || type.includes('team-history')) {
        await new Promise(r => setTimeout(r, 5000));
    }

    // 🎨 تطبيق تنسيقاتك المثالية حرفياً
    await page.evaluate((contentType) => {
      const style = document.createElement('style');
      style.innerHTML = `
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@700;900&display=swap');
        body { background: white !important; font-family: 'Cairo', sans-serif !important; direction: rtl !important; margin: 0 !important; padding: 20px !important; }
        nav, footer, .sidebar, button, .no-print, [class*="back-btn"], header, [class*="header"], .tabs-container { display: none !important; }
        .tournament-header, [class*="testConnection"] { display: none !important; }
        .pitch-fade-in, .team-lineup, .dream-team-wrapper { display: block !important; visibility: visible !important; opacity: 1 !important; }
      `;
      document.head.appendChild(style);
    }, type);

    await new Promise(r => setTimeout(r, 2000));
    const bodyHeight = await page.evaluate(() => document.documentElement.scrollHeight);

    return await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: viewWidth, height: Math.min(bodyHeight, 8000) }
    });

  } finally {
    if (browser) await browser.close();
  }
}

// دالة ألبوم الـ 20 فريق (كاملة)
async function captureAllLineups(gw, userToken) {
  const allTeamIds = [
    '69581904b9878d54b915221d', '695823deb446037eeae9113a', '695824f0b446037eeae913c9',
    '6958295eb446037eeae91851', '69583753dbc855907b69b5ea', '69583b35dbc855907b69ba4e',
    '6958496b459fd5a748387737', '6958608c785323bdb45785f3', '6958cae28089a1fddabee1b2',
    '69591a626cb913e5a7b5e53e', '69591cb96cb913e5a7b5e6d2', '695924d5ecd6b3a44a7798e5',
    '69592edbdc868ecce40f4f24', '695938b5dc868ecce40f55ab', '69596a4acc1cbf7f53e69ab6',
    '69596ae8cc1cbf7f53e69c03', '6959713dcc1cbf7f53e6a206', '69597baccc1cbf7f53e6b8f8',
    '69598d20cc1cbf7f53e6cd7c', '69599a52cc1cbf7f53e6ddb6'
  ];
  const screenshots = [];
  for (const teamId of allTeamIds) {
    try {
      const buffer = await captureScreenshot('team-history', gw, userToken, teamId);
      screenshots.push(buffer);
    } catch (e) { console.error(`❌ فشل الفريق ${teamId}`); }
  }
  return screenshots;
}

// دالة النشر الموحدة لفيسبوك
exports.publishToFacebook = async (req, res) => {
  const { type, gw, caption } = req.body;
  const userToken = req.headers.authorization?.replace('Bearer ', '') || req.user?.token;
  const FB_URL = `https://graph.facebook.com/v18.0/${process.env.FB_PAGE_ID}/photos`;

  try {
    if (type === 'lineups') {
      const allScreenshots = await captureAllLineups(gw, userToken);
      const mediaIds = [];
      for (const buffer of allScreenshots) {
        const formData = new FormData();
        formData.append('source', buffer, { filename: 'team.png', contentType: 'image/png' });
        formData.append('published', 'false');
        formData.append('access_token', process.env.FB_PAGE_ACCESS_TOKEN);
        const uploadRes = await axios.post(FB_URL, formData, { headers: formData.getHeaders() });
        mediaIds.push({ media_fbid: uploadRes.data.id });
      }
      await axios.post(`https://graph.facebook.com/v18.0/${process.env.FB_PAGE_ID}/feed`, {
        message: caption || `🎮 تشكيلات الجولة ${gw}`,
        attached_media: mediaIds,
        access_token: process.env.FB_PAGE_ACCESS_TOKEN
      });
      return res.json({ success: true, message: "تم نشر الألبوم بنجاح" });
    }

    const imageBuffer = await captureScreenshot(type, gw, userToken);
    const formData = new FormData();
    formData.append('source', imageBuffer, { filename: 'post.png', contentType: 'image/png' });
    formData.append('message', caption || "");
    formData.append('access_token', process.env.FB_PAGE_ACCESS_TOKEN);
    await axios.post(FB_URL, formData, { headers: formData.getHeaders() });
    res.json({ success: true, message: "تم النشر من Render بنجاح" });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

exports.getPreview = async (req, res) => {
  const { type, gw, teamId } = req.body;
  const userToken = req.headers.authorization?.replace('Bearer ', '') || req.user?.token;
  try {
    const imageBuffer = await captureScreenshot(type, gw, userToken, teamId);
    res.json({ success: true, previewImage: `data:image/png;base64,${imageBuffer.toString('base64')}` });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

module.exports = exports;