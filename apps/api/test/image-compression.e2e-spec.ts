/**
 * اختبار ضغط الصور عند الرفع (D2 — المسار المحلي):
 *  - صورة PNG تُرفع ⇒ تُخزَّن **WebP** أصغر (جودة 80/≤1200px)، والحصّة تُحدَّث بالحجم المضغوط.
 *  - ملف غير صورة (PDF) يُخزَّن كما هو دون مساس.
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import sharp from "sharp";
import { AppModule } from "../src/app.module";

const pathOf = (url: string) => new URL(url).pathname;
// جامع بايتات خام لردود supertest الثنائية
const binaryParser = (res: NodeJS.ReadableStream, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on("data", (c: Buffer) => chunks.push(c));
  res.on("end", () => cb(null, Buffer.concat(chunks)));
};

describe("ضغط الصور (e2e)", () => {
  let app: INestApplication;
  const srv = () => app.getHttpServer();
  const uniq = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function newOwner(): Promise<string> {
    const res = await request(srv()).post("/signup").send({ companyName: `صور ${uniq()}`, adminName: "مالك", adminEmail: `img-${uniq()}@brk.sa`, password: "Owner1Pass" }).expect(201);
    return res.body.accessToken;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  afterAll(async () => { await app?.close(); });

  it("PNG مرفوعة ⇒ تُخزَّن WebP أصغر والحصّة بالحجم المضغوط", async () => {
    const token = await newOwner();
    // صورة 2000×2000 بنمط عالي التردد (PNG ~1.6MB) ⇒ بعد resize≤1200 وWebP q80 تصغر بوضوح
    const W = 2000, H = 2000, raw = Buffer.alloc(W * H * 3);
    let k = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { raw[k++] = (x ^ y) & 0xff; raw[k++] = (x * 3 + y) & 0xff; raw[k++] = (x * y) & 0xff; }
    const png = await sharp(raw, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();

    const up = (await request(srv()).post("/documents/upload-url").set(auth(token))
      .send({ entityType: "client", entityId: "c1", fileName: "photo.png", mime: "image/png", sizeBytes: png.length, docType: "ATTACHMENT" }).expect(201)).body;
    expect(up.upload.url).toContain("/documents/blob/");

    const putRes = (await request(srv()).put(pathOf(up.upload.url)).set("Content-Type", "image/png").send(png).expect(200)).body;
    expect(putRes.size).toBeLessThan(png.length); // ضُغِطت

    // استرجاع البايتات المخزَّنة ⇒ وسم WebP
    const view = (await request(srv()).get(`/documents/${up.documentId}/url`).set(auth(token)).expect(200)).body;
    const blobRes = await request(srv()).get(pathOf(view.view.url)).buffer(true).parse(binaryParser as never).expect(200);
    const buf = blobRes.body as Buffer;
    expect(buf.slice(0, 4).toString("latin1")).toBe("RIFF");
    expect(buf.slice(8, 12).toString("latin1")).toBe("WEBP");

    // الحصّة عُدّلت للحجم المضغوط (المستأجر فارغ ⇒ الاستهلاك = المضغوط)
    const usage = (await request(srv()).get("/documents/usage").set(auth(token)).expect(200)).body;
    expect(usage.usedBytes).toBe(putRes.size);
  });

  it("ملف غير صورة (PDF) يُخزَّن دون ضغط", async () => {
    const token = await newOwner();
    const pdf = Buffer.from("%PDF-1.4 وثيقة اختبار غير قابلة للضغط كصورة");
    const up = (await request(srv()).post("/documents/upload-url").set(auth(token))
      .send({ entityType: "client", entityId: "c1", fileName: "doc.pdf", mime: "application/pdf", sizeBytes: pdf.length, docType: "OFFICIAL" }).expect(201)).body;
    const putRes = (await request(srv()).put(pathOf(up.upload.url)).set("Content-Type", "application/pdf").send(pdf).expect(200)).body;
    expect(putRes.size).toBe(pdf.length); // بلا مساس
  });
});
