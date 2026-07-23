import { ImageResponse } from "next/og";

// صورة مشاركة الرابط (Open Graph / تويتر / واتساب) — نفس شعار المنصّة (درع على خلفية فيروزية)،
// مولَّدة بالكود عبر next/og (بلا أصول ثنائية). 1200×630.
export const alt = "IBP — Insurance Brokerage Operating System";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0b3f39 0%, #0d9488 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        {/* لوحة الشعار — درع أبيض داخل مربّع زجاجي */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 190,
            height: 190,
            borderRadius: 46,
            background: "rgba(255,255,255,0.12)",
            border: "2px solid rgba(255,255,255,0.28)",
          }}
        >
          <svg width="108" height="108" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        </div>
        <div style={{ marginTop: 44, fontSize: 104, fontWeight: 800, letterSpacing: -3 }}>IBP</div>
        <div style={{ marginTop: 6, fontSize: 34, opacity: 0.92 }}>Insurance Brokerage Operating System</div>
        <div style={{ marginTop: 10, fontSize: 24, opacity: 0.68 }}>ibp.payone.one</div>
      </div>
    ),
    { ...size },
  );
}
