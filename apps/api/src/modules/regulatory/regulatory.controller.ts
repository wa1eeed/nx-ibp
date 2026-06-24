import { Controller, Get } from "@nestjs/common";
import { RegulatoryService } from "./regulatory.service";
import { Authorize } from "../rbac/authorize.decorator";

/** حالة التكاملات التنظيمية — صلاحية settings:read (إداري المستأجر). */
@Controller("regulatory")
export class RegulatoryController {
  constructor(private readonly regulatory: RegulatoryService) {}

  @Authorize({ module: "settings", action: "read" })
  @Get("status")
  status() {
    return this.regulatory.status();
  }
}
