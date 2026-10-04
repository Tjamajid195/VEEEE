/**
 * ============================================================================
 * 👑 MDavari VPN PRO — Cloudflare Worker + Telegram Admin Bot (Remote Control)
 * ============================================================================
 * امکانات این ورکر ابری:
 * 1. کنترل لحظه‌ای قیمت هر ۴ پلن اشتراک از داخل ربات تلگرام (/prices 1 2 3 5)
 * 2. تغییر لحظه‌ای آدرس کیف‌پول‌های تتر و تون (/trc20, /bep20, /ton) از داخل تلگرام
 * 3. تغییر لحظه‌ای آیکون‌ها و برچسب‌های جذاب کارت‌های اشتراک از تلگرام (/icons, /badges)
 * 4. تغییر آیدی تلگرام پشتیبانی (/support @Username)
 * 5. صدور خودکار کد لایسنس (MDPRO-YYYYMMDD-90D-XXXXXX) داخل ربات تلگرام با یک کلیک
 *    یا فقط با فوروارد کردن پیام سفارش مشتری به ربات!
 * 6. مسدود کردن (Ban) یا رفع مسدودیت کد دستگاه مشتری از راه دور (/ban MD-XXXX...)
 * 7. امضای دیجیتال رمزنگاری‌شده (HMAC-SHA256) روی تمام تنظیمات ارسالی به برنامه
 * ============================================================================
 */

const MASTER_SECRET = "MDAVARI_VIP_PRO_MASTER_SECRET_2026_GOLD";

// تنظیمات پیش‌فرض اولیه (در صورتی که هنوز از ربات تغییر نداده باشید)
const DEFAULT_CONFIG = {
  prices_usdt: [1, 2, 3, 5], // [۱ ماهه, ۳ ماهه, ۶ ماهه, ۱ ساله] به تتر / دلار
  plan_icons: ["bolt", "star", "diamond", "crown"], // آیکون‌های ۴ کارت اشتراک
  plan_badges: ["اقتصادی", "پرطرفدار", "پیشنهاد ویژه", "یکساله طلایی"], // برچسب بالای ۴ کارت
  wallet_trc20: "TZ6ZXsBGTEAfWkw4KGNDPcnQBH8eSpEX6A",
  wallet_bep20: "0xC69FaF72A1c80a6c054Ed2E129d8947291215eC9",
  wallet_ton: "UQCUE7F9Q58HC4yH9FUS12p2FedHtMr-32gZ8ZkOrIyfUEV7",
  telegram_id: "MDavari_Support_bot",
  notice_text: "💎 اشتراک VIP PRO — فعال‌سازی آنی پس از تایید پرداخت",
  banned_hwids: [],
  updated_at: "2026-10-02T00:00:00Z"
};

// در صورتی که در بخش Variables کلودفلر متغیر نساختید، می‌توانید مستقیم اینجا هم بنویسید:
const DEFAULT_BOT_TOKEN = "PUT_YOUR_TELEGRAM_BOT_TOKEN_HERE";
const DEFAULT_ADMIN_CHAT_ID = "PUT_YOUR_NUMERIC_TELEGRAM_ID_HERE";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ── تحویل مستقیم فایل EXE نسخه 4.1 (دور زدن کش/پراکسی‌های قدیمی) ──
    if (path === "/exe") {
      const up = await fetch(
        "https://raw.githubusercontent.com/Tjamajid195/VEEEE/arena/01a101a4-veeee/MDavari_VPN_PRO_v41.exe",
        { headers: { "cache-control": "no-cache" } }
      );
      if (!up.ok) return new Response("upstream error " + up.status, { status: 502 });
      return new Response(up.body, {
        headers: {
          "content-type": "application/octet-stream",
          "content-disposition": 'attachment; filename="MDavari_VPN_PRO_v41.exe"',
          "cache-control": "no-store",
        },
      });
    }
    if (path === "/sha") {
      return new Response("203cc7cefef4e76b30e2fdc57c0221d6c8ce52ab36820e4949dded942df91722\n");
    }

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // ------------------------------------------------------------------------
    // ۱. مسیر دریافت تنظیمات توسط برنامه ویندوز و اندروید مشتری: GET /config
    // ------------------------------------------------------------------------
    if (path === "/" || path === "/config" || path === "/api/config") {
      const cfg = await loadConfig(env);
      const signature = await signConfigPayload(cfg);
      const responsePayload = {
        ok: true,
        prices_usdt: cfg.prices_usdt,
        plan_icons: cfg.plan_icons || DEFAULT_CONFIG.plan_icons,
        plan_badges: cfg.plan_badges || DEFAULT_CONFIG.plan_badges,
        wallet_trc20: cfg.wallet_trc20,
        wallet_bep20: cfg.wallet_bep20,
        wallet_ton: cfg.wallet_ton,
        telegram_id: cfg.telegram_id,
        notice_text: cfg.notice_text,
        banned_hwids: cfg.banned_hwids || [],
        updated_at: cfg.updated_at,
        signature: signature
      };
      return new Response(JSON.stringify(responsePayload, null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store, no-cache, must-revalidate",
          ...corsHeaders
        }
      });
    }

    // ------------------------------------------------------------------------
    // ۲. مسیر اتصال خودکار وب‌هوک تلگرام با یک کلیک در مرورگر: GET /setup
    // ------------------------------------------------------------------------
    if (path === "/setup") {
      const botToken = getBotToken(env);
      if (!botToken || botToken.includes("PUT_YOUR_")) {
        return new Response(
          "⚠️ خطا: لطفاً ابتدا BOT_TOKEN را در تنظیمات کلودفلر (Variables) یا داخل کد وارد کنید.",
          { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } }
        );
      }
      const webhookUrl = `${url.origin}/webhook`;
      const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
      const tgJson = await tgRes.json();

      const adminId = getAdminChatId(env);
      if (adminId && !adminId.includes("PUT_YOUR_")) {
        await sendTelegramMessage(
          botToken,
          adminId,
          "✅ <b>ربات مدیریت ابری MDavari VPN PRO با موفقیت به کلودفلر متصل شد!</b>\n\n" +
          "برای مشاهده پنل مدیریت و دستورات، دستور /start را ارسال کنید."
        );
      }

      return new Response(
        `<!DOCTYPE html><html dir="rtl" lang="fa"><head><meta charset="utf-8"><title>راه‌اندازی ربات MDavari VPN PRO</title>` +
        `<style>body{background:#090D16;color:#F8FAFC;font-family:Tahoma,sans-serif;padding:40px;text-align:center;}` +
        `.card{max-width:560px;margin:0 auto;background:#11192A;border:1px solid #F59E0B;border-radius:16px;padding:28px;}` +
        `h2{color:#FBBF24;}code{background:#020617;color:#38BDF8;padding:6px 10px;border-radius:6px;display:inline-block;margin:8px 0;direction:ltr;}</style></head>` +
        `<body><div class="card"><h2>✅ وب‌هوک ربات تلگرام با موفقیت متصل شد!</h2>` +
        `<p>آدرس وب‌هوک ثبت‌شده:</p><code>${webhookUrl}</code>` +
        `<p>آدرس تنظیمات ابری برای قرار دادن در برنامه:</p><code>${url.origin}/config</code>` +
        `<p style="color:#34D399;margin-top:20px;">نتیجه تلگرام: ${JSON.stringify(tgJson)}</p>` +
        `<p>اکنون وارد ربات تلگرام خود شوید و دستور <b>/start</b> را بفرستید.</p></div></body></html>`,
        { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    // ------------------------------------------------------------------------
    // ۳. مسیر دریافت پیام‌های ربات تلگرام (Webhook): POST /webhook
    // ------------------------------------------------------------------------
    if (path === "/webhook" && request.method === "POST") {
      try {
        const update = await request.json();
        await handleTelegramUpdate(update, env, url.origin);
      } catch (err) {
        // Always return 200 OK to Telegram so it doesn't retry endlessly
      }
      return new Response("OK", { status: 200 });
    }

    return new Response("MDavari VPN PRO Cloud Worker Active.", { status: 200 });
  }
};

// ============================================================================
// پردازش دستورات ادمین در ربات تلگرام
// ============================================================================
async function handleTelegramUpdate(update, env, workerOrigin) {
  const msg = update.message || update.edited_message;
  if (!msg || !msg.text) return;

  const botToken = getBotToken(env);
  const adminChatId = getAdminChatId(env);
  const chatId = String(msg.chat.id);
  const text = msg.text.trim();

  // بررسی امنیتی: فقط ادمین اصلی اجازه کنترل ربات را دارد
  if (adminChatId && !adminChatId.includes("PUT_YOUR_") && chatId !== String(adminChatId).trim()) {
    await sendTelegramMessage(
      botToken,
      chatId,
      "⛔ <b>دسترسی غیرمجاز!</b>\n\n" +
      "این ربات مخصوص مدیریت فروشنده <b>MDavari VPN PRO</b> است.\n" +
      `🆔 شناسه عددی تلگرام شما: <code>${chatId}</code>\n` +
      "(اگر شما مدیر هستید، این شناسه عددی را در متغیر ADMIN_CHAT_ID کلودفلر قرار دهید)."
    );
    return;
  }

  const cfg = await loadConfig(env);

  // ۱. دستور /start یا /help
  if (text === "/start" || text === "/help") {
    const helpMsg =
      "👑 <b>پنل مدیریت ابری MDavari VPN PRO (کلودفلر + تلگرام)</b>\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      "با دستورات زیر می‌توانید قیمت‌ها، کیف‌پول‌ها، آیکون کارت‌ها و لایسنس‌ها را <b>در لحظه</b> از راه دور کنترل کنید:\n\n" +
      "📊 <b>مشاهده وضعیت فعلی:</b>\n" +
      "<code>/status</code>\n\n" +
      "💲 <b>تغییر قیمت ۴ پلن (۱ماهه، ۳ماهه، ۶ماهه، ۱ساله به تتر):</b>\n" +
      "<code>/prices 1 2 3 5</code>\n\n" +
      "🎨 <b>تغییر آیکون ۴ کارت اشتراک از راه دور:</b>\n" +
      "<code>/icons bolt star diamond crown</code>\n" +
      "<i>(آیکون‌های مجاز: bolt, star, diamond, crown, fire, rocket, shield, gift, medal, heart, globe, vip)</i>\n\n" +
      "🏷 <b>تغییر برچسب بالای ۴ کارت اشتراک:</b>\n" +
      "<code>/badges اقتصادی پرطرفدار پیشنهاد_ویژه ویژه_VIP</code>\n\n" +
      "💎 <b>تغییر کیف‌پول تتر TRC20:</b>\n" +
      "<code>/trc20 TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE</code>\n\n" +
      "🔶 <b>تغییر کیف‌پول تتر BEP20:</b>\n" +
      "<code>/bep20 0x71C...89A</code>\n\n" +
      "💠 <b>تغییر کیف‌پول شبکه TON:</b>\n" +
      "<code>/ton UQBy...xYz</code>\n\n" +
      "✈️ <b>تغییر آیدی تلگرام پشتیبانی:</b>\n" +
      "<code>/support MDavari_Support_bot</code>\n\n" +
      "🔑 <b>صدور آنی کد لایسنس برای مشتری:</b>\n" +
      "<code>/key MD-A1B2-C3D4-E5F6 90</code>\n" +
      "<i>(نکته طلایی: اگر پیام سفارش مشتری را مستقیم به همین ربات فوروارد کنید، ربات خودش کد دستگاه و پلن را تشخیص می‌دهد و کد لایسنس را می‌سازد!)</i>\n\n" +
      "🚫 <b>مسدود کردن / رفع مسدودیت دستگاه مشتری:</b>\n" +
      "<code>/ban MD-A1B2-C3D4-E5F6</code>\n" +
      "<code>/unban MD-A1B2-C3D4-E5F6</code>\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      `🌐 لینک تنظیمات ابری برنامه:\n<code>${workerOrigin}/config</code>`;
    await sendTelegramMessage(botToken, chatId, helpMsg);
    return;
  }

  // ۲. دستور /status
  if (text === "/status") {
    const p = cfg.prices_usdt || [1, 2, 3, 5];
    const ic = cfg.plan_icons || DEFAULT_CONFIG.plan_icons;
    const bd = cfg.plan_badges || DEFAULT_CONFIG.plan_badges;
    const statusMsg =
      "📊 <b>وضعیت فعلی تنظیمات ابری MDavari VPN PRO:</b>\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      `🔹 <b>پلن ۱ ماهه (۳۰ روز):</b> <code>${p[0]} تتر / دلار</code> | آیکون: <code>${ic[0]}</code> | برچسب: <code>${bd[0]}</code>\n` +
      `🔹 <b>پلن ۳ ماهه (۹۰ روز):</b> <code>${p[1]} تتر / دلار</code> | آیکون: <code>${ic[1]}</code> | برچسب: <code>${bd[1]}</code>\n` +
      `🔹 <b>پلن ۶ ماهه (۱۸۰ روز):</b> <code>${p[2]} تتر / دلار</code> | آیکون: <code>${ic[2]}</code> | برچسب: <code>${bd[2]}</code>\n` +
      `🔹 <b>پلن ۱ ساله (۳۶۵ روز):</b> <code>${p[3]} تتر / دلار</code> | آیکون: <code>${ic[3]}</code> | برچسب: <code>${bd[3]}</code>\n` +
      "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      `💎 <b>کیف‌پول TRC20:</b>\n<code>${cfg.wallet_trc20}</code>\n\n` +
      `🔶 <b>کیف‌پول BEP20:</b>\n<code>${cfg.wallet_bep20}</code>\n\n` +
      `💠 <b>کیف‌پول TON:</b>\n<code>${cfg.wallet_ton}</code>\n\n` +
      `✈️ <b>آیدی تلگرام پشتیبانی:</b> <code>@${cfg.telegram_id}</code>\n` +
      `🚫 <b>تعداد دستگاه‌های مسدود (Ban):</b> <code>${(cfg.banned_hwids || []).length} دستگاه</code>\n` +
      `🕒 <b>آخرین بروزرسانی:</b> <code>${cfg.updated_at}</code>`;
    await sendTelegramMessage(botToken, chatId, statusMsg);
    return;
  }

  // ۳. تغییر قیمت‌ها: /prices 1 2 3 5
  if (text.startsWith("/prices")) {
    const parts = text.replace("/prices", "").trim().split(/[\s,]+/);
    if (parts.length !== 4 || parts.some(x => isNaN(Number(x)) || Number(x) <= 0)) {
      await sendTelegramMessage(
        botToken,
        chatId,
        "⚠️ <b>فرمت نادرست!</b>\nلطفاً ۴ عدد (به ترتیب ۱ماهه، ۳ماهه، ۶ماهه و ۱ساله) وارد کنید.\nمثال:\n<code>/prices 1 2 3 5</code>"
      );
      return;
    }
    cfg.prices_usdt = parts.map(x => Number(x));
    await saveConfig(env, cfg);
    await sendTelegramMessage(
      botToken,
      chatId,
      "✅ <b>قیمت پلن‌ها در سرور ابری بروزرسانی شد!</b>\n\n" +
      `• ۱ ماهه: <b>${cfg.prices_usdt[0]} تتر / دلار</b>\n` +
      `• ۳ ماهه: <b>${cfg.prices_usdt[1]} تتر / دلار</b>\n` +
      `• ۶ ماهه: <b>${cfg.prices_usdt[2]} تتر / دلار</b>\n` +
      `• ۱ ساله: <b>${cfg.prices_usdt[3]} تتر / دلار</b>\n\n` +
      "🔄 این قیمت‌ها از همین لحظه در برنامه تمام مشتریان نمایش داده می‌شود."
    );
    return;
  }

  // ۴. تغییر آیکون کارت‌های اشتراک: /icons bolt star diamond crown
  if (text.startsWith("/icons")) {
    const parts = text.replace("/icons", "").trim().split(/[\s,]+/);
    if (parts.length !== 4) {
      await sendTelegramMessage(
        botToken,
        chatId,
        "⚠️ <b>فرمت نادرست!</b>\nلطفاً ۴ نام آیکون (برای ۱ماهه، ۳ماهه، ۶ماهه و ۱ساله) وارد کنید.\n" +
        "آیکون‌های قابل انتخاب:\n<code>bolt, star, diamond, crown, fire, rocket, shield, gift, medal, heart, globe, vip</code>\n\n" +
        "مثال:\n<code>/icons fire rocket diamond crown</code>"
      );
      return;
    }
    cfg.plan_icons = parts.map(x => x.trim().toLowerCase());
    await saveConfig(env, cfg);
    await sendTelegramMessage(
      botToken,
      chatId,
      "🎨 <b>آیکون‌های هر ۴ کارت اشتراک از راه دور تغییر کرد!</b>\n\n" +
      `• ۱ ماهه: <code>${cfg.plan_icons[0]}</code>\n` +
      `• ۳ ماهه: <code>${cfg.plan_icons[1]}</code>\n` +
      `• ۶ ماهه: <code>${cfg.plan_icons[2]}</code>\n` +
      `• ۱ ساله: <code>${cfg.plan_icons[3]}</code>`
    );
    return;
  }

  // ۵. تغییر برچسب‌های بالای کارت‌ها: /badges اقتصادی پرطرفدار پیشنهاد_ویژه ویژه_VIP
  if (text.startsWith("/badges")) {
    const parts = text.replace("/badges", "").trim().split(/[\s,]+/);
    if (parts.length !== 4) {
      await sendTelegramMessage(
        botToken,
        chatId,
        "⚠️ <b>فرمت نادرست!</b>\nلطفاً ۴ برچسب (برای ۱ماهه، ۳ماهه، ۶ماهه و ۱ساله) وارد کنید (برای فاصله از _ استفاده کنید).\n" +
        "مثال:\n<code>/badges اقتصادی پرطرفدار پیشنهاد_ویژه ویژه_VIP</code>"
      );
      return;
    }
    cfg.plan_badges = parts.map(x => x.replace(/_/g, " ").trim());
    await saveConfig(env, cfg);
    await sendTelegramMessage(
      botToken,
      chatId,
      "🏷 <b>برچسب‌های کارت‌های اشتراک بروزرسانی شد!</b>\n\n" +
      `• ۱ ماهه: <b>${cfg.plan_badges[0]}</b>\n` +
      `• ۳ ماهه: <b>${cfg.plan_badges[1]}</b>\n` +
      `• ۶ ماهه: <b>${cfg.plan_badges[2]}</b>\n` +
      `• ۱ ساله: <b>${cfg.plan_badges[3]}</b>`
    );
    return;
  }

  // ۶. تغییر آدرس کیف‌پول TRC20
  if (text.startsWith("/trc20 ")) {
    const val = text.substring(7).trim();
    if (val.length < 10) {
      await sendTelegramMessage(botToken, chatId, "⚠️ آدرس کیف‌پول معتبر نیست.");
      return;
    }
    cfg.wallet_trc20 = val;
    await saveConfig(env, cfg);
    await sendTelegramMessage(botToken, chatId, `✅ آدرس کیف‌پول <b>USDT (TRC20)</b> بروزرسانی شد:\n<code>${val}</code>`);
    return;
  }

  // ۷. تغییر آدرس کیف‌پول BEP20
  if (text.startsWith("/bep20 ")) {
    const val = text.substring(7).trim();
    if (val.length < 10) {
      await sendTelegramMessage(botToken, chatId, "⚠️ آدرس کیف‌پول معتبر نیست.");
      return;
    }
    cfg.wallet_bep20 = val;
    await saveConfig(env, cfg);
    await sendTelegramMessage(botToken, chatId, `✅ آدرس کیف‌پول <b>USDT (BEP20)</b> بروزرسانی شد:\n<code>${val}</code>`);
    return;
  }

  // ۸. تغییر آدرس کیف‌پول TON
  if (text.startsWith("/ton ")) {
    const val = text.substring(5).trim();
    if (val.length < 10) {
      await sendTelegramMessage(botToken, chatId, "⚠️ آدرس کیف‌پول معتبر نیست.");
      return;
    }
    cfg.wallet_ton = val;
    await saveConfig(env, cfg);
    await sendTelegramMessage(botToken, chatId, `✅ آدرس کیف‌پول <b>TON</b> بروزرسانی شد:\n<code>${val}</code>`);
    return;
  }

  // ۹. تغییر آیدی تلگرام پشتیبانی
  if (text.startsWith("/support ")) {
    const val = text.substring(9).trim().replace(/^@/, "");
    if (val.length < 3) {
      await sendTelegramMessage(botToken, chatId, "⚠️ آیدی تلگرام معتبر نیست.");
      return;
    }
    cfg.telegram_id = val;
    await saveConfig(env, cfg);
    await sendTelegramMessage(botToken, chatId, `✅ آیدی تلگرام پشتیبانی به <code>@${val}</code> تغییر یافت.`);
    return;
  }

  // ۱۰. مسدود کردن دستگاه مشتری: /ban MD-XXXX-XXXX-XXXX
  if (text.startsWith("/ban ")) {
    const hwid = text.substring(5).trim().toUpperCase();
    if (!cfg.banned_hwids) cfg.banned_hwids = [];
    if (!cfg.banned_hwids.includes(hwid)) cfg.banned_hwids.push(hwid);
    await saveConfig(env, cfg);
    await sendTelegramMessage(botToken, chatId, `🚫 دستگاه <code>${hwid}</code> مسدود شد و دکمه اتصال آن در برنامه قفل گردید.`);
    return;
  }

  // ۱۱. رفع مسدودیت دستگاه مشتری: /unban MD-XXXX-XXXX-XXXX
  if (text.startsWith("/unban ")) {
    const hwid = text.substring(7).trim().toUpperCase();
    cfg.banned_hwids = (cfg.banned_hwids || []).filter(x => x !== hwid);
    await saveConfig(env, cfg);
    await sendTelegramMessage(botToken, chatId, `✅ مسدودیت دستگاه <code>${hwid}</code> برطرف شد.`);
    return;
  }

  // ۱۲. صدور دستی کد لایسنس: /key MD-XXXX-XXXX-XXXX 90
  if (text.startsWith("/key ")) {
    const parts = text.substring(5).trim().split(/\s+/);
    const hwid = (parts[0] || "").toUpperCase();
    const days = parseInt(parts[1] || "90", 10);
    if (!hwid || hwid.length < 5 || ![30, 90, 180, 365].includes(days)) {
      await sendTelegramMessage(
        botToken,
        chatId,
        "⚠️ <b>فرمت دستور:</b>\n<code>/key MD-XXXX-XXXX-XXXX 90</code>\n(مدت مجاز: 30 یا 90 یا 180 یا 365 روز)"
      );
      return;
    }
    const lic = await generateLicenseKey(hwid, days);
    await sendTelegramMessage(
      botToken,
      chatId,
      "👑 <b>کد لایسنس اختصاصی صادر شد:</b>\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      `🖥 <b>کد دستگاه:</b> <code>${hwid}</code>\n` +
      `⏱ <b>مدت اشتراک:</b> <b>${days} روزه</b>\n` +
      `📅 <b>تاریخ انقضا (UTC):</b> <code>${lic.expiryFormatted}</code>\n\n` +
      `🔑 <b>کد لایسنس (ضربه بزنید تا کپی شود):</b>\n<code>${lic.key}</code>`
    );
    return;
  }

  // ۱۳. تشخیص هوشمند پیام فورواردشده سفارش مشتری!
  const hwidMatch = text.match(/MD-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}/i);
  if (hwidMatch) {
    const detectedHwid = hwidMatch[0].toUpperCase();
    let detectedDays = 90;
    if (text.includes("۱ ماهه") || text.includes("1 ماهه") || text.includes("30 روز") || text.includes("۳۰ روز")) {
      detectedDays = 30;
    } else if (text.includes("۳ ماهه") || text.includes("3 ماهه") || text.includes("90 روز") || text.includes("۹۰ روز")) {
      detectedDays = 90;
    } else if (text.includes("۶ ماهه") || text.includes("6 ماهه") || text.includes("180 روز") || text.includes("۱۸۰ روز")) {
      detectedDays = 180;
    } else if (text.includes("۱ ساله") || text.includes("1 ساله") || text.includes("365 روز") || text.includes("۳۶۵ روز")) {
      detectedDays = 365;
    }

    const lic = await generateLicenseKey(detectedHwid, detectedDays);
    const k30 = (await generateLicenseKey(detectedHwid, 30)).key;
    const k90 = (await generateLicenseKey(detectedHwid, 90)).key;
    const k180 = (await generateLicenseKey(detectedHwid, 180)).key;
    const k365 = (await generateLicenseKey(detectedHwid, 365)).key;

    await sendTelegramMessage(
      botToken,
      chatId,
      "🎯 <b>سفارش مشتری به صورت خودکار شناسایی شد!</b>\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      `📱 <b>کد دستگاه مشتری:</b> <code>${detectedHwid}</code>\n` +
      `📦 <b>پلن تشخیص داده‌شده:</b> <b>${detectedDays} روزه</b>\n` +
      `📅 <b>تاریخ انقضا:</b> <code>${lic.expiryFormatted}</code>\n\n` +
      `✅ <b>کد لایسنس آماده ارسال به مشتری:</b>\n<code>${lic.key}</code>\n\n` +
      "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      "💡 <i>سایر پلن‌ها برای همین دستگاه (در صورت نیاز):</i>\n" +
      `• ۱ ماهه (30D): <code>${k30}</code>\n` +
      `• ۳ ماهه (90D): <code>${k90}</code>\n` +
      `• ۶ ماهه (180D): <code>${k180}</code>\n` +
      `• ۱ ساله (365D): <code>${k365}</code>`
    );
    return;
  }

  await sendTelegramMessage(
    botToken,
    chatId,
    "ℹ️ دستور شناخته نشد. برای مشاهده لیست دستورات /start یا /status را بفرستید، یا پیام سفارش مشتری را به اینجا فوروارد کنید."
  );
}

// ============================================================================
// توابع رمزنگاری HMAC-SHA256 (سازگار با برنامه ویندوز و اندروید)
// ============================================================================
async function hmacSha256Hex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

async function generateLicenseKey(hwid, days) {
  const cleanHwid = hwid.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const now = new Date();
  const exp = new Date(now.getTime() + days * 86400 * 1000);
  const yyyy = exp.getUTCFullYear();
  const mm = String(exp.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(exp.getUTCDate()).padStart(2, "0");
  const expiryYmd = `${yyyy}${mm}${dd}`;
  const hex = await hmacSha256Hex(MASTER_SECRET, `${cleanHwid}|${expiryYmd}|${days}`);
  const sig6 = hex.substring(0, 6);
  return {
    key: `MDPRO-${expiryYmd}-${days}D-${sig6}`,
    expiryFormatted: `${yyyy}-${mm}-${dd}`
  };
}

async function signConfigPayload(cfg) {
  const p = (cfg.prices_usdt || [1, 2, 3, 5]).join(",");
  const canonical = `${p}|${cfg.wallet_trc20}|${cfg.wallet_bep20}|${cfg.wallet_ton}|${cfg.telegram_id}`;
  return await hmacSha256Hex(MASTER_SECRET, canonical);
}

// ============================================================================
// ذخیره و بازیابی تنظیمات در Cloudflare KV
// ============================================================================
async function loadConfig(env) {
  let cfg = null;
  try {
    if (env && env.MDAVARI_KV) {
      const raw = await env.MDAVARI_KV.get("cloud_config_v1");
      if (raw) {
        const parsed = JSON.parse(raw);
        cfg = { ...DEFAULT_CONFIG, ...parsed };
      }
    }
  } catch (e) {}
  if (!cfg) cfg = { ...DEFAULT_CONFIG };
  // migration: اگر مقدار قدیمی در KV ذخیره شده باشد، خودکار به آیدی جدید ربات ارتقا می‌یابد
  if (String(cfg.telegram_id || "").trim().replace(/^@/, "") === "MDavari_Support") {
    cfg.telegram_id = "MDavari_Support_bot";
  }
  return cfg;
}

async function saveConfig(env, cfg) {
  cfg.updated_at = new Date().toISOString();
  if (env && env.MDAVARI_KV) {
    await env.MDAVARI_KV.put("cloud_config_v1", JSON.stringify(cfg));
  }
}

function getBotToken(env) {
  return (env && env.BOT_TOKEN) ? env.BOT_TOKEN : DEFAULT_BOT_TOKEN;
}

function getAdminChatId(env) {
  return (env && env.ADMIN_CHAT_ID) ? env.ADMIN_CHAT_ID : DEFAULT_ADMIN_CHAT_ID;
}

async function sendTelegramMessage(botToken, chatId, htmlText) {
  if (!botToken || botToken.includes("PUT_YOUR_")) return;
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: htmlText,
      parse_mode: "HTML",
      disable_web_page_preview: true
    })
  });
}
