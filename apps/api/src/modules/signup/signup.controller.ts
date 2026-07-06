import { Body, Controller, Get, Post } from "@nestjs/common";
import { SignupService } from "./signup.service";
import { SignupDto } from "./dto/signup.dto";
import { Public } from "../auth/public.decorator";

@Controller("signup")
export class SignupController {
  constructor(private readonly signup: SignupService) {}

  /** كتالوج الباقات العام (للاندينق + معالج التسجيل). */
  @Public()
  @Get("plans")
  plans() {
    return this.signup.plans();
  }

  /** تسجيل ذاتي لشركة وساطة جديدة — عام، يُزوّد المستأجر ويُسجّل الدخول مباشرةً. */
  @Public()
  @Post()
  create(@Body() dto: SignupDto) {
    return this.signup.signup(dto);
  }
}
