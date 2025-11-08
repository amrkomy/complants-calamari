// netlify/functions/notifyOnComplaintInsert.js
const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID;
const ONESIGNAL_REST_KEY = process.env.ONESIGNAL_REST_KEY;

exports.handler = async (event) => {
  // التحقق من طريقة الطلب
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method Not Allowed" })
    };
  }

  // التحقق من وجود المفاتيح
  if (!ONESIGNAL_REST_KEY || !ONESIGNAL_APP_ID) {
    console.error("❌ Missing OneSignal credentials in Netlify env");
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server misconfiguration: missing OneSignal keys" })
    };
  }

  try {
    // تحليل الجسم
    const body = JSON.parse(event.body || "{}");
    const complaint = body.record; // Supabase Webhook يُرسل السجل تحت "record"

    if (!complaint) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing 'record' in payload" })
      };
    }

    // ✅ ترميز المفتاح بشكل صحيح لـ Basic Auth
    const auth = Buffer.from(`:${ONESIGNAL_REST_KEY}`).toString("base64");

    // إعداد حمولة OneSignal
    const payload = {
      app_id: ONESIGNAL_APP_ID,
      included_segments: ["Subscribed Users"], // ← لا تستخدم "All"
      headings: { ar: "شكوى جديدة!" },
      contents: {
        ar: `من: ${complaint.customer_name || "عميل"} - ${complaint.customer_phone || ""}`
      },
      url: "https://admin-complants-calamari.netlify.app/"
    };

    // إرسال الطلب إلى OneSignal
    const response = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${auth}` // ← هذا هو التنسيق الصحيح
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    // تسجيل الخطأ في السجلات إن وُجد
    if (!response.ok) {
      console.error("OneSignal API error:", result);
    }

    return {
      statusCode: response.status,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(result)
    };
  } catch (err) {
    console.error("Function error:", err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error" })
    };
  }
};
