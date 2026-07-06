import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ProducersService } from "./producers.service";
import { CreateProducerDto, SettleProducerDto, UpdateProducerDto } from "./dto/producer.dto";
import { Authorize } from "../rbac/authorize.decorator";
import { CurrentUser } from "../auth/current-user.decorator";

/**
 * سجلّ المنتِجين (الوسطاء الفرعيون) — تحت وحدة المالية (دفتر العمولات + تسويتها = شأن مالي).
 */
@Controller("producers")
export class ProducersController {
  constructor(private readonly producers: ProducersService) {}

  @Authorize({ module: "finance", action: "read", entitlement: "feature.producers" })
  @Get()
  list() {
    return this.producers.list();
  }

  @Authorize({ module: "finance", action: "read", entitlement: "feature.producers" })
  @Get(":id")
  get(@Param("id") id: string) {
    return this.producers.get(id);
  }

  @Authorize({ module: "finance", action: "create", entitlement: "feature.producers" })
  @Post()
  create(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Body() dto: CreateProducerDto) {
    return this.producers.create(tenantId, userId, dto);
  }

  @Authorize({ module: "finance", action: "update", entitlement: "feature.producers" })
  @Patch(":id")
  update(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Param("id") id: string, @Body() dto: UpdateProducerDto) {
    return this.producers.update(tenantId, userId, id, dto);
  }

  // التسوية = صرف مالي
  @Authorize({ module: "finance", action: "create", entitlement: "feature.producers" })
  @Post(":id/settle")
  settle(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Param("id") id: string, @Body() dto: SettleProducerDto) {
    return this.producers.settle(tenantId, userId, id, dto);
  }
}
