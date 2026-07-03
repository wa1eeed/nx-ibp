import { Module } from "@nestjs/common";
import { RevertController } from "./revert.controller";
import { RevertService } from "./revert.service";

// PermissionService عالمي (RbacModule @Global)؛ لا يلزم استيراده.
@Module({
  controllers: [RevertController],
  providers: [RevertService],
})
export class RevertModule {}
