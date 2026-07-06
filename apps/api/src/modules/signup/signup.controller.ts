import { Body, Controller, Get, Post } from "@nestjs/common";
import { SignupService } from "./signup.service";
import { SignupDto, LeadDto } from "./dto/signup.dto";
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

  /** مصفوفة مقارنة الباقات العامة (صفحة المقارنة). */
  @Public()
  @Get("compare")
  compare() {
    return this.signup.compare();
  }

  /** تسجيل ذاتي لشركة وساطة جديدة — عام، يُزوّد المستأجر ويُسجّل الدخول مباشرةً. */
  @Public()
  @Post()
  create(@Body() dto: SignupDto) {
    return this.signup.signup(dto);
  }

  /** طلب تواصل مبيعات (للباقات الكبيرة) — عام. */
  @Public()
  @Post("lead")
  lead(@Body() dto: LeadDto) {
    return this.signup.createLead(dto);
  }
}
