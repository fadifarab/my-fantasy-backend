const puppeteer = require('puppeteer');
const axios = require('axios');
const FormData = require('form-data');

// 🔧 إعدادات إضافية للتحسين
const MAX_RETRIES = 3;
const WAIT_TIMEOUT = 30000;
/*const SCREENSHOT_QUALITY = {
  width: 1200,
  height: 800,
  deviceScaleFactor: 2
};*/
const SCREENSHOT_QUALITY = {
  width: 900, // تقليل العرض يجعل الجدول يبدو أضخم في الصورة
  height: 600, 
  deviceScaleFactor: 3 // جودة عالية جداً لضمان عدم تشوش الخط الكبير
};

// ===================== دالة الالتقاط الرئيسية =====================
async function captureScreenshot(type, gw, userToken) {
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
  let browser;

  try {
    console.log(`🚀 بدء عملية الالتقاط لـ ${type} - GW: ${gw}`);

    // 1. إطلاق المتصفح
    browser = await puppeteer.launch({
      headless: "new",
	  //executablePath: '/usr/bin/google-chrome-stable',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
		'--single-process',
		'--no-zygote',
        '--window-size=1920,1080'
      ]
    });

    const page = await browser.newPage();

    // 2. إعدادات الدقة العالية (ScaleFactor 3 لضمان حدة الخطوط الكبيرة)
    await page.setViewport({
      width: 950, 
      height: 1000,
      deviceScaleFactor: 3
    });

    // 3. حقن التوكن في الهيدرز
    if (userToken) {
      await page.setExtraHTTPHeaders({
        'Authorization': `Bearer ${userToken}`,
        'Accept-Language': 'ar,en;q=0.9'
      });
    }

    // 4. الانتقال للرئيسية لحقن LocalStorage
    await page.goto(FRONTEND_URL, { waitUntil: 'networkidle0', timeout: 60000 });
    if (userToken) {
      await page.evaluate((token) => {
        localStorage.setItem('userInfo', JSON.stringify({ token, timestamp: Date.now() }));
      }, userToken);
    }

    // 5. الانتقال للصفحة المستهدفة
    const targetUrl = `${FRONTEND_URL}/${type}?mode=capture&gw=${gw}`;
    console.log(`🎯 الانتقال إلى: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle0', timeout: 30000 });

    // 6. الانتظار حتى تحميل البيانات
    console.log("⏳ انتظار تحميل البيانات...");
    await page.waitForFunction(() => {
      const rows = document.querySelectorAll('tbody tr');
      return rows.length > 0 && Array.from(rows).some(row => row.innerText.trim().length > 0);
    }, { timeout: 20000 });

    // 7. 🔥 التعديل الجوهري لتكبير أسماء الفرق وكل المحتويات
    await page.evaluate(() => {
      const style = document.createElement('style');
      style.innerHTML = `
        /* تكبير كل النصوص داخل خلايا الجدول إجبارياً */
        td, th, td *, th *, span, a, div { 
          font-size: 28px !important; 
          font-weight: 800 !important; /* خط عريض جداً للوضوح */
          line-height: 1.2 !important;
          font-family: 'Cairo', sans-serif !important; /* تأكد من استخدام خط واضح */
        }
        
        /* زيادة مساحة خلايا الجدول لراحة العين */
        td { 
          padding: 15px 8px !important; 
          vertical-align: middle !important;
          border-bottom: 1px solid #eee !important;
        }

        /* تكبير العناوين (اسم الدوري والموسم) */
        h1, h2, .tournament-title, [class*="title"] { 
          font-size: 38px !important; 
          margin-bottom: 15px !important;
          font-weight: 900 !important;
          text-align: center !important;
        }

        /* إجبار الجدول على ملء عرض الصورة */
        table { 
          width: 100% !important; 
          border-collapse: collapse !important; 
          table-layout: auto !important;
        }
        
        /* تنظيف الحواف وإلغاء المساحات الفارغة الجانبية */
        body, #capture-area, .container, [class*="container"] { 
          margin: 0 !important; 
          padding: 10px !important; 
          width: 950px !important; 
          background: white !important;
        }

        /* إخفاء العناصر المزعجة في الصورة */
        footer, .no-print, nav, button, .sidebar, [class*="nav"] { 
          display: none !important; 
        }

        /* تحسين مظهر الأرقام لتكون واضحة */
        .points, [class*="score"] {
          color: #38003c !important; /* لون الفانتزي الرسمي */
        }
      `;
      document.head.appendChild(style);
    });

    // 8. انتظار بسيط ليستقر التصميم بعد تكبير الخطوط
    await new Promise(r => setTimeout(r, 2000));

    // 9. حساب الأبعاد الفعلية للمحتوى (لحذف الفراغ السفلي)
    const bodyHandle = await page.$('body');
    const boundingBox = await bodyHandle.boundingBox();
    const finalHeight = Math.ceil(boundingBox.height);

    // 10. ضبط الـ Viewport ليكون على مقاس المحتوى بالضبط
    await page.setViewport({
      width: 950,
      height: finalHeight,
      deviceScaleFactor: 3
    });

    // 11. التقاط الصورة مع قص الحواف بدقة
    console.log('📸 التقاط اللقطة النهائية...');
    const imageBuffer = await page.screenshot({
      type: 'png',
      clip: {
        x: 0,
        y: 0,
        width: 950,
        height: finalHeight
      }
    });

    console.log(`✅ تم الالتقاط بنجاح. الطول: ${finalHeight}px`);
    return imageBuffer;

  } catch (error) {
    console.error('❌ خطأ في الالتقاط:', error.message);
    throw new Error(`فشل الالتقاط: ${error.message}`);
  } finally {
    if (browser) await browser.close();
  }
}

// ===================== دالة الالتقاط مع إعادة المحاولة =====================
async function captureScreenshotWithRetry(type, gw, userToken, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    console.log(`🔄 محاولة الالتقاط ${attempt} من ${retries}`);
    
    try {
      return await captureScreenshot(type, gw, userToken);
    } catch (error) {
      console.error(`❌ فشلت المحاولة ${attempt}: ${error.message}`);
      
      if (attempt === retries) {
        throw new Error(`فشلت جميع محاولات الالتقاط: ${error.message}`);
      }
      
      // انتظار تصاعدي قبل المحاولة التالية
      const waitTime = 2000 * attempt;
      console.log(`⏳ الانتظار ${waitTime}ms قبل المحاولة التالية...`);
      await new Promise(r => setTimeout(r, waitTime));
    }
  }
}

// ===================== Middleware للتحقق من التوكن =====================
/*const verifyToken = (req, res, next) => {
  const token = req.body.token || req.query.token || req.headers['authorization'];
  
  if (!token) {
    return res.status(401).json({ 
      success: false, 
      message: "التوكن مطلوب للمصادقة" 
    });
  }
  
  // يمكن إضافة تحقق إضافي من صحة التوكن هنا
  const cleanToken = token.replace('Bearer ', '');
  req.cleanToken = cleanToken;
  
  next();
};*/

// ===================== 1️⃣ دالة جلب المعاينة (Preview) =====================
exports.getPreview = async (req, res) => {
  console.log('📱 طلب معاينة جديد');
  
  const { type, gw } = req.body;
  
  // ✅ التوكن موجود في req.user بسبب middleware protect
  // احصل على التوكن من المستخدم المصادق عليه
  const userToken = req.user?.token || req.headers.authorization?.replace('Bearer ', '');
  
  // التحقق من البيانات المطلوبة
  if (!type || !gw) {
    return res.status(400).json({ 
      success: false, 
      message: "بيانات ناقصة: type و gw مطلوبان" 
    });
  }
  
  try {
    const startTime = Date.now();
    
    // استخدام النسخة مع إعادة المحاولة
    const imageBuffer = await captureScreenshotWithRetry(type, gw, userToken);
    const base64Image = imageBuffer.toString('base64');
    
    const processingTime = Date.now() - startTime;
    console.log(`⏱️  وقت المعالجة: ${processingTime}ms`);
    
    res.json({ 
      success: true, 
      previewImage: `data:image/png;base64,${base64Image}`,
      processingTime: `${processingTime}ms`,
      size: `${(base64Image.length * 0.75) / 1024} KB`
    });
    
  } catch (error) {
    console.error("❌ خطأ في المعاينة:", error.message);
    res.status(500).json({ 
      success: false, 
      message: `فشل في إنشاء المعاينة: ${error.message}` 
    });
  }
};

// ===================== 2️⃣ مُعالج النشر النهائي (Confirm Publish) =====================
exports.publishToFacebook = async (req, res) => {
  console.log('📤 طلب نشر إلى فيسبوك');
  
  const { type, gw, caption } = req.body;
  
  // ✅ الحل: استخلاص التوكن من الهيدرز مباشرة مثلما فعلنا في المعاينة
  const userToken = req.headers.authorization?.replace('Bearer ', '') || req.user?.token;
  
  const PAGE_ID = process.env.FB_PAGE_ID;
  const ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;

  // التحقق من البيانات المطلوبة
  if (!type || !gw || !caption) {
    return res.status(400).json({ 
      success: false, 
      message: "بيانات ناقصة: type و gw و caption مطلوبان" 
    });
  }

  if (!PAGE_ID || !ACCESS_TOKEN) {
    console.error('❌ إعدادات فيسبوك ناقصة');
    return res.status(500).json({ 
      success: false, 
      message: "إعدادات فيسبوك ناقصة، يرجى التحقق من FB_PAGE_ID و FB_PAGE_ACCESS_TOKEN" 
    });
  }

  try {
    const startTime = Date.now();
	
	const imageBuffer = await captureScreenshotWithRetry(type, gw, userToken);
    
    // 1. التقاط لقطة الشاشة
    //const imageBuffer = await captureScreenshotWithRetry(type, gw, token);
    console.log(`✅ تم التقاط الصورة (${imageBuffer.length} bytes)`);

    // 2. تحضير البيانات للنشر
    const formData = new FormData();
    formData.append('source', imageBuffer, { 
      filename: `post_${type}_${gw}_${Date.now()}.png`,
      contentType: 'image/png'
    });
    formData.append('message', caption);
    formData.append('access_token', ACCESS_TOKEN);
    formData.append('published', 'true');

    // 3. النشر إلى فيسبوك
    console.log(`📤 جاري النشر إلى صفحة فيسبوك ${PAGE_ID}...`);
    
    const fbResponse = await axios.post(
      `https://graph.facebook.com/v18.0/${PAGE_ID}/photos`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
        },
        timeout: 60000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      }
    );

    const processingTime = Date.now() - startTime;
    console.log(`✅ تم النشر بنجاح! ID: ${fbResponse.data.id}`);
    console.log(`⏱️  وقت المعالجة الكلي: ${processingTime}ms`);

    res.json({ 
      success: true, 
      fbId: fbResponse.data.id,
      postId: fbResponse.data.post_id,
      message: "تم النشر إلى فيسبوك بنجاح",
      processingTime: `${processingTime}ms`,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error("❌ خطأ في النشر إلى فيسبوك:", error.message);
    
    if (error.response) {
      console.error('تفاصيل خطأ فيسبوك:', error.response.data);
    }
    
    const statusCode = error.response?.status || 500;
    const errorMessage = error.response?.data?.error?.message || error.message;
    
    res.status(statusCode).json({ 
      success: false, 
      message: `فشل النشر إلى فيسبوك: ${errorMessage}`,
      details: error.response?.data?.error || null
    });
  }
};

// ===================== دالة فحص الصحة (Health Check) =====================
exports.healthCheck = async (req, res) => {
  res.json({
    status: 'healthy',
    service: 'screenshot-capture-service',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    features: {
      preview: true,
      facebookPublish: true,
      retryMechanism: true
    },
    environment: process.env.NODE_ENV || 'development'
  });
};

// ===================== 3️⃣ دالة الاختبار (اختيارية) =====================
exports.testCapture = async (req, res) => {
  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({ 
      success: false, 
      message: "يرجى تقديم رابط للاختبار" 
    });
  }
  
  let browser;
  try {
    browser = await puppeteer.launch({ 
      headless: "new",
      args: ['--no-sandbox']
    });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });
    
    const screenshot = await page.screenshot({ type: 'png' });
    const base64Image = screenshot.toString('base64');
    
    res.json({
      success: true,
      message: "تم الاختبار بنجاح",
      screenshot: `data:image/png;base64,${base64Image}`,
      pageTitle: await page.title()
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: `فشل الاختبار: ${error.message}` 
    });
  } finally {
    if (browser) await browser.close();
  }
};

module.exports = exports;