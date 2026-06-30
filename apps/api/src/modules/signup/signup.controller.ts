import { Body, Controller, Post } from "@nestjs/common";
import { SignupService } from "./signup.service";
import { SignupDto } from "./dto/signup.dto";
import { Public } from "../auth/public.decorator";

@Controller("signup")
export class SignupController {
  constructor(private readonly signup: SignupService) {}

  /** تسجيل ذاتي لشركة وساطة جديدة — عام، يُزوّد المستأجر ويُسجّل الدخول مباشرةً. */
  @Public()
  @Post()
  create(@Body() dto: SignupDto) {
    return this.signup.signup(dto);
  }
}
