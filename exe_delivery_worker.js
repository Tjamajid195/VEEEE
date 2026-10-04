// ربات تحویل فایل EXE اصلاح‌شده — دور زدن کش/پراکسی‌های قدیمی
// در پنل Cloudflare: Workers & Pages → Create → Hello World → کد را جایگزین کنید → Save and Deploy
// سپس آدرس همان ورکر + /exe را در مرورگر باز کنید تا فایل تازه دانلود شود.

const FILE_URL =
  "https://raw.githubusercontent.com/Tjamajid195/VEEEE/arena/01a101a4-veeee/MDavari_VPN_PRO_v41.exe";

const EXPECTED_SHA256 =
  "5e13e66d60ab74f0eba80dd189cc16a65d8c9879c6c2269d49cccc4c09ebf8d3";

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/exe") {
      const upstream = await fetch(FILE_URL, {
        headers: { "cache-control": "no-cache" },
        cf: { cacheTtl: 0 },
      });
      if (!upstream.ok) {
        return new Response("upstream error " + upstream.status, { status: 502 });
      }
      return new Response(upstream.body, {
        headers: {
          "content-type": "application/octet-stream",
          "content-disposition": 'attachment; filename="MDavari_VPN_PRO_v41.exe"',
          "cache-control": "no-store",
        },
      });
    }

    if (url.pathname === "/sha") {
      return new Response(EXPECTED_SHA256 + "\n");
    }

    return new Response(
      "MDavari VPN PRO v4.1 delivery\n" +
        "GET /exe  -> download fresh EXE\n" +
        "GET /sha  -> expected sha256\n"
    );
  },
};
