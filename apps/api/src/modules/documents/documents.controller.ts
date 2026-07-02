import { Body, Controller, Get, Param, Post, Put, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { DocumentsService } from "./documents.service";
import { StorageUsageService } from "./storage-usage.service";
import { UploadUrlDto } from "./dto/upload-url.dto";
import { Public } from "../auth/public.decorator";
import { CurrentUser } from "../auth/current-user.decorator";

@Controller("documents")
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly storageUsage: StorageUsageService,
  ) {}

  /** تلميتري استهلاك التخزين للمستأجر (المستخدَم/الحصّة/النسبة). */
  @Get("usage")
  usage(@CurrentUser("tenantId") tenantId: string) {
    return this.storageUsage.usage(tenantId);
  }

  // الرفع/الخدمة عبر الرابط الموقّت — عام (التوكن قصير العمر هو التفويض، لا روابط عامة دائمة)
  @Public()
  @Put("blob/:token")
  async uploadBlob(@Param("token") token: string, @Req() req: Request) {
    const body = req.body as Buffer;
    return this.documents.receiveBlob(token, Buffer.isBuffer(body) ? body : Buffer.from(body ?? []));
  }

  @Public()
  @Get("blob/:token")
  async serveBlob(@Param("token") token: string, @Res() res: Response) {
    const data = await this.documents.serveBlob(token);
    res.setHeader("Cache-Control", "no-store");
    res.send(data);
  }

  // ----- نقاط مصادَقة (معزولة بالمستأجر) -----

  @Post("upload-url")
  createUploadUrl(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("userId") userId: string,
    @Body() dto: UploadUrlDto,
  ) {
    return this.documents.createUploadUrl(tenantId, userId, dto);
  }

  // تأكيد الرفع المباشر للدلو (سحابي) — يثبّت الحجم/البصمة بعد رفع العميل مباشرةً
  @Post(":id/confirm")
  confirmUpload(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("userId") userId: string,
    @Param("id") id: string,
  ) {
    return this.documents.confirmUpload(tenantId, userId, id);
  }

  @Get()
  list(@Query("entityType") entityType: string, @Query("entityId") entityId: string) {
    return this.documents.list(entityType, entityId);
  }

  @Get(":id/url")
  getViewUrl(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("userId") userId: string,
    @Param("id") id: string,
  ) {
    return this.documents.getViewUrl(tenantId, userId, id);
  }
}
