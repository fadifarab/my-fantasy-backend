const puppeteer = require('puppeteer');
const axios = require('axios');
const FormData = require('form-data');

// 🔧 إعدادات الجودة والاتصال
const MAX_RETRIES = 3;

async function captureScreenshot(type, gw, userToken, teamId = null) {
  const FRONTEND_URL = process.env.FRONTEND_URL || 'https://fpl-zeddine.vercel.app';
  let browser;

  try {
    // 🔥 الانتقال للاتصال السحابي لضمان العمل على Render
    const browserlessToken = process.env.BROWSERLESS_TOKEN || '2TrS5mYdRmu4pyR91ac97d1ed53b2f26f6822d8f62510b2eb';
    
    browser = await puppeteer.connect({
      browserWSEndpoint: `wss://chrome.browserless.io?token=${browserlessToken}`,
    });

    const page = await browser.newPage();

    // 1. تحديد العرض بناءً على النوع (من كودك المستقر)
    const isStandings = (type === 'league' || type === 'standings');
    const viewWidth = isStandings ? 950 : 1400;

    await page.setViewport({
      width: viewWidth,
      height: 1200,
      deviceScaleFactor: 3 // جودة عالية جداً
    });

    // ✅ حقن التوكن والمصادقة (طريقتك الناجحة من الكود الثاني)
    if (userToken) {
      await page.evaluateOnNewDocument((token) => {
        const userObject = {
          _id: '6958141eb9878d54b9151bc0',
          username: 'NEW Ayhem', 
          role: 'admin',
          leagueId: '69581438b9878d54b9151be1',
          teamId: '695823deb446037eeae9113a',
          token: token
        };
        localStorage.setItem('user', JSON.stringify(userObject));
        localStorage.setItem('token', token);
        localStorage.setItem('userInfo', JSON.stringify({ token, timestamp: Date.now() }));
      }, userToken);
      
      await page.setExtraHTTPHeaders({ 'Authorization': `Bearer ${userToken}` });
    }

    // ✅ بناء الرابط الصحيح
    let targetUrl;
    if (type === 'lineups' || type === 'formation' || type === 'team-history') {
      const finalTeamId = teamId || '695823deb446037eeae9113a';
      targetUrl = `${FRONTEND_URL}/team-history/${finalTeamId}?mode=capture&gw=${gw}`;
    } else {
      targetUrl = `${FRONTEND_URL}/${type}?mode=capture&gw=${gw}`;
    }

    await page.goto(targetUrl, { waitUntil: 'networkidle0', timeout: 60000 });

    // ✅ الانتظار لتحميل المحتوى
    await page.waitForSelector('body', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 4000)); // وقت كافٍ للأقمصة والملعب

    // 2. تطبيق الأنماط (تنسيقاتك المثالية حرفياً)
    await page.evaluate((contentType) => {
      const style = document.createElement('style');
      let finalCSS = `
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@700;900&display=swap');
        body { background: white !important; font-family: 'Cairo', sans-serif !important; direction: rtl !important; margin: 0 !important; padding: 20px !important; }
        nav, footer, .sidebar, button, .no-print, [class*="back-btn"], header, [class*="header"] { display: none !important; }
        [class*="testConnection"], [class*="info"], [class*="message"], .tournament-header { display: none !important; }
      `;

      if (contentType === 'league' || contentType === 'standings') {
        finalCSS += `
          body, .container { width: 950px !important; padding: 10px !important; }
          td, th, td *, th *, span, a, div { font-size: 28px !important; font-weight: 800 !important; line-height: 1.2 !important; }
          td { padding: 15px 8px !important; vertical-align: middle !important; border-bottom: 1px solid #eee !important; }
          h1, h2, .tournament-title, [class*="title"] { font-size: 38px !important; font-weight: 900 !important; text-align: center !important; display: block !important; }
          table { width: 100% !important; border-collapse: collapse !important; table-layout: auto !important; }
          .points, [class*="score"] { color: #38003c !important; }
        `;
      } else if (contentType === 'fixtures' || contentType === 'matches') {
        finalCSS += `
          body { padding: 30px !important; width: 1200px !important; }
          .fixtures-container, [class*="match"], .match-row { display: flex !important; width: 100% !important; margin-bottom: 15px !important; }
        `;
      } else {
        finalCSS += `
          body { width: 1400px !important; padding: 40px !important; background: white !important; }
          .pitch-fade-in, .team-lineup, .formation-container { display: block !important; visibility: visible !important; opacity: 1 !important; }
          [class*="player-card"], [class*="PlayerCard"] { border: 2px solid #ddd !important; margin: 5px !important; }
          h1, h2, h3 { color: #38003c !important; text-align: center !important; margin: 20px 0 !important; }
        `;
      }

      style.innerHTML = finalCSS;
      document.head.appendChild(style);
    }, type);

    await new Promise(r => setTimeout(r, 2000));
    const bodyHeight = await page.evaluate(() => document.documentElement.scrollHeight);

    // التقاط الصورة
    return await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: viewWidth, height: Math.min(bodyHeight, 8000) }
    });

  } catch (error) {
    throw new Error(`فشل الالتقاط السحابي: ${error.message}`);
  } finally {
    if (browser) await browser.close();
  }
}

// ✅ دالة التقاط الـ 20 تشكيلة (من كودك الثاني المستقر)
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
      const buffer = await captureScreenshot('lineups', gw, userToken, teamId);
      screenshots.push(buffer);
    } catch (e) { console.error(`❌ فشل الفريق ${teamId}: ${e.message}`); }
  }
  return screenshots;
}

// ✅ دالة النشر (ألبوم + فردي)
exports.publishToFacebook = async (req, res) => {
  const { type, gw, caption } = req.body;
  const userToken = req.headers.authorization?.replace('Bearer ', '') || req.user?.token;
  const FB_URL = `https://graph.facebook.com/v18.0/${process.env.FB_PAGE_ID}`;

  try {
    if (type === 'lineups') {
      const allScreenshots = await captureAllLineups(gw, userToken);
      const mediaIds = [];
      for (const buffer of allScreenshots) {
        const formData = new FormData();
        formData.append('source', buffer, { filename: 'team.png', contentType: 'image/png' });
        formData.append('published', 'false');
        formData.append('access_token', process.env.FB_PAGE_ACCESS_TOKEN);
        const uploadRes = await axios.post(`${FB_URL}/photos`, formData, { headers: formData.getHeaders() });
        mediaIds.push({ media_fbid: uploadRes.data.id });
      }
      await axios.post(`${FB_URL}/feed`, {
        message: caption || `🎮 تشكيلات الجولة ${gw}`,
        attached_media: mediaIds,
        access_token: process.env.FB_PAGE_ACCESS_TOKEN
      });
      return res.json({ success: true, message: "تم نشر ألبوم التشكيلات الـ 20 بنجاح" });
    }

    const imageBuffer = await captureScreenshot(type, gw, userToken);
    const formData = new FormData();
    formData.append('source', imageBuffer, { filename: 'post.png', contentType: 'image/png' });
    formData.append('message', caption);
    formData.append('access_token', process.env.FB_PAGE_ACCESS_TOKEN);
    await axios.post(`${FB_URL}/photos`, formData, { headers: formData.getHeaders() });
    res.json({ success: true, message: "تم النشر بنجاح" });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

exports.getPreview = async (req, res) => {
  const { type, gw, teamId } = req.body;
  const userToken = req.user?.token || req.headers.authorization?.replace('Bearer ', '');
  try {
    const imageBuffer = await captureScreenshot(type, gw, userToken, teamId);
    res.json({ success: true, previewImage: `data:image/png;base64,${imageBuffer.toString('base64')}` });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

module.exports = exports;