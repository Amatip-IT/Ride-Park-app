import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';
import * as handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';

interface NodemailerInfo {
  accepted: string[];
  rejected: string[];
  envelopeTime: number;
  messageTime: number;
  messageSize: number;
  response: string;
  envelope: object;
  messageId: string;
}

@Injectable()
export class EmailService {
  private transporter: Transporter;
  private templatesPath: string;

  constructor(private configService: ConfigService) {
    this.templatesPath = path.join(process.cwd(), 'src/email/templates');
    this.initializeTransporter();
    this.registerPartials();
  }

  private getSenderAddress(): string {
    return (
      this.configService.get<string>('SMTP_FROM') ||
      this.configService.get<string>('SMTP_USER') ||
      this.configService.get<string>('GMAIL_USER') ||
      'noreply@gleezip.com'
    );
  }

  /**
   * Initialize SMTP transporter (generic host or legacy Gmail service shortcut).
   */
  private initializeTransporter(): void {
    const host = this.configService.get<string>('SMTP_HOST');
    const user =
      this.configService.get<string>('SMTP_USER') ||
      this.configService.get<string>('GMAIL_USER');
    const password =
      this.configService.get<string>('SMTP_PASSWORD') ||
      this.configService.get<string>('SMTP_PASS') ||
      this.configService.get<string>('GMAIL_APP_PASSWORD');

    if (host) {
      const port = Number(this.configService.get<string>('SMTP_PORT') || 587);
      const secureSetting = this.configService.get<string>('SMTP_SECURE');
      const secure =
        secureSetting === 'true' || (secureSetting !== 'false' && port === 465);

      if (!user || !password) {
        console.warn(
          '⚠️ SMTP_HOST is set but SMTP_USER and SMTP_PASSWORD (or SMTP_PASS) are missing. Emails will fail if called.',
        );
        return;
      }

      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass: password },
      });
    } else if (user && password) {
      // Legacy Gmail shortcut when only GMAIL_* vars are configured
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass: password },
      });
    } else {
      console.warn(
        '⚠️ SMTP not configured (set SMTP_HOST, SMTP_USER, SMTP_PASSWORD or SMTP_PASS). Emails will fail if called.',
      );
      return;
    }

    // SMTP verification opens a network socket. Keep it opt-in so constructors
    // remain side-effect free in tests and in short-lived maintenance commands.
    if (
      process.env.NODE_ENV === 'test' ||
      this.configService.get<string>('SMTP_VERIFY_ON_STARTUP') !== 'true'
    ) {
      return;
    }

    this.transporter.verify((error) => {
      if (error) {
        console.warn(
          '⚠️ Email service verification failed (check SMTP_HOST, SMTP_USER, SMTP_PASSWORD/SMTP_PASS):',
          error.message,
        );
      } else {
        console.log('Email service ready to send emails');
      }
    });
  }

  /**
   * Register all Handlebars partials (header, footer, etc.)
   */
  private registerPartials(): void {
    const partialsPath = path.join(this.templatesPath, 'partials');

    try {
      if (!fs.existsSync(partialsPath)) {
        console.warn('Partials directory not found at:', partialsPath);
        return;
      }

      const partialFiles = fs
        .readdirSync(partialsPath)
        .filter((file) => file.endsWith('.hbs'));

      partialFiles.forEach((file) => {
        const partialName = path.basename(file, '.hbs');
        const partialPath = path.join(partialsPath, file);
        const partialTemplate = fs.readFileSync(partialPath, 'utf-8');

        handlebars.registerPartial(partialName, partialTemplate);
      });
    } catch (error) {
      console.error('Failed to register partials:', error);
    }
  }

  /**
   * Compile template with layout wrapper
   * Throws error if template not found
   */
  private compileTemplate(templateName: string, data: any): string {
    const templatePath = path.join(this.templatesPath, `${templateName}.hbs`);
    const layoutPath = path.join(this.templatesPath, 'layouts', 'main.hbs');

    if (!fs.existsSync(templatePath)) {
      throw new InternalServerErrorException(
        `Email template not found: ${templateName}.hbs. Please create the template before using it.`,
      );
    }

    if (!fs.existsSync(layoutPath)) {
      throw new InternalServerErrorException(
        `Email layout not found: main.hbs. Please create the layout.`,
      );
    }

    try {
      const templateSource = fs.readFileSync(templatePath, 'utf-8');
      const template = handlebars.compile(templateSource);
      const renderedContent = template(data);

      const layoutSource = fs.readFileSync(layoutPath, 'utf-8');
      const layoutTemplate = handlebars.compile(layoutSource);

      return layoutTemplate({
        ...data,
        body: renderedContent,
      });
    } catch (error) {
      console.error(`Failed to compile template "${templateName}":`, error);
      throw new InternalServerErrorException(
        `Failed to compile email template: ${templateName}`,
      );
    }
  }

  /**
   * Send OTP email for email verification
   */
  async sendOtpEmail(email: string, otp: string): Promise<boolean> {
    try {
      const html = this.compileTemplate('otp', {
        otp,
        subject: 'Email Verification - Gleezip',
        headerGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        headerPadding: '30px',
        titleSize: '28px',
        headerIcon: '🚗',
        headerTitle: 'Gleezip',
        headerSubtitle: 'Email Verification',
        year: new Date().getFullYear(),
        contactEmail: 'support@gleezip.com',
      });

      const mailOptions = {
        from: `"Gleezip" <${this.getSenderAddress()}>`,
        to: email,
        subject: 'Email Verification - Gleezip',
        html,
      };

      const info = (await this.transporter.sendMail(
        mailOptions,
      )) as NodemailerInfo;
      console.log(`OTP email sent to ${email}: ${info.messageId}`);
      return true;
    } catch (error) {
      console.error(`Failed to send OTP email to ${email}:`, error);
      throw new InternalServerErrorException(
        'Failed to send verification email. Please try again later.',
      );
    }
  }

  /**
   * Send welcome email after successful verification
   */
  async sendWelcomeEmail(email: string, firstName: string): Promise<boolean> {
    try {
      const html = this.compileTemplate('welcome', {
        firstName,
        subject: 'Welcome to Gleezip! 🎉',
        headerGradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        headerPadding: '40px 30px',
        titleSize: '32px',
        headerIcon: '🎉',
        headerTitle: 'Welcome Aboard!',
        year: new Date().getFullYear(),
        contactEmail: 'support@gleezip.com',
      });

      const mailOptions = {
        from: `"Gleezip" <${this.getSenderAddress()}>`,
        to: email,
        subject: 'Welcome to Gleezip! 🎉',
        html,
      };

      const info = (await this.transporter.sendMail(
        mailOptions,
      )) as NodemailerInfo;
      console.log(`Welcome email sent to ${email}: ${info.messageId}`);
      return true;
    } catch (error) {
      console.error(`Failed to send welcome email to ${email}:`, error);
      return false;
    }
  }

  /**
   * Send a plain HTML email (used by admin notifications)
   */
  async sendMail(options: {
    to: string;
    subject: string;
    html: string;
    text?: string;
  }): Promise<boolean> {
    if (!this.transporter) {
      console.warn(
        `Email not sent to ${options.to}: transporter not configured`,
      );
      return false;
    }

    try {
      const mailOptions = {
        from: `"Gleezip" <${this.getSenderAddress()}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      };

      const info = (await this.transporter.sendMail(
        mailOptions,
      )) as NodemailerInfo;
      console.log(`Email sent to ${options.to}: ${info.messageId}`);
      return true;
    } catch (error) {
      console.error(`Failed to send email to ${options.to}:`, error);
      return false;
    }
  }

  /**
   * Generic method to send any templated email
   */
  async sendTemplateEmail(
    email: string,
    subject: string,
    templateName: string,
    data: any,
  ): Promise<boolean> {
    try {
      const html = this.compileTemplate(templateName, {
        ...data,
        subject,
        year: new Date().getFullYear(),
      });

      const mailOptions = {
        from: `"Gleezip" <${this.getSenderAddress()}>`,
        to: email,
        subject,
        html,
      };

      const info = (await this.transporter.sendMail(
        mailOptions,
      )) as NodemailerInfo;
      console.log(`Email sent to ${email}: ${info.messageId}`);
      return true;
    } catch (error) {
      console.error(`Failed to send email to ${email}:`, error);
      throw new InternalServerErrorException(
        'Failed to send email. Please try again later.',
      );
    }
  }
}
