import { Controller, Get, Param } from "@nestjs/common";
import { CatalogService } from "./catalog.service";

// كتالوج مرجعي — يكفي أن يكون المستخدم مصادَقاً (JwtAuthGuard العالمي).
@Controller("catalog")
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  tree() {
    return this.catalog.tree();
  }

  /** الكتالوج + إحصاءات إنتاج المستأجر لكل فرع (لصفحة المنتجات). */
  @Get("stats")
  stats() {
    return this.catalog.withStats();
  }

  @Get("lines/:code")
  line(@Param("code") code: string) {
    return this.catalog.line(code);
  }
}
