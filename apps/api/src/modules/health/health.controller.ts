import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { HealthService } from "./health.service";
import { Public } from "../auth/public.decorator";

@Public() // الفحص الصحّي متاح بلا مصادقة
@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** فحص حيّ بسيط (Liveness). */
  @Get("live")
  live() {
    return { status: "ok" };
  }

  /** فحص شامل مع التبعيات (DB + Redis). 503 لو إحداها معطّلة. */
  @Get()
  async check() {
    const result = await this.health.check();
    if (result.status !== "ok") {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }
}
