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

  /**
   * Initialize Gmail SMTP transporter
   */
  private initializeTransporter(): void {
    const gmailUser = this.configService.get<string>('GMAIL_USER');
    const gmailAppPassword =
      this.configService.get<string>('GMAIL_APP_PASSWORD');

    if (!gmailUser || !gmailAppPassword) {
      console.warn('⚠️ Gmail credentials not configured. Emails will fail if called.');
      return;
    }

    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailAppPassword,
      },
    });

    this.transporter.verify((error) => {
      if (error) {
        console.warn('⚠️ Email service verification failed (likely invalid credentials). Emails will fail to send:', error.message);
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
      // Step 1: Compile and render the template content
      const templateSource = fs.readFileSync(templatePath, 'utf-8');
      const template = handlebars.compile(templateSource);
      const renderedContent = template(data);

      // Step 2: Compile layout and inject the rendered content
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
        subject: 'Email Verification - Ride and Park',
        headerGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        headerPadding: '30px',
        titleSize: '28px',
        headerIcon: '🚗',
        headerTitle: 'Ride and Park',
        headerSubtitle: 'Email Verification',
        year: new Date().getFullYear(),
        contactEmail: 'support@rideandpark.com',
      });

      const mailOptions = {
        from: `"Ride and Park" <${this.configService.get<string>('GMAIL_USER')}>`,
        to: email,
        subject: 'Email Verification - Ride and Park',
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
        subject: 'Welcome to Ride and Park! 🎉',
        headerGradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        headerPadding: '40px 30px',
        titleSize: '32px',
        headerIcon: '🎉',
        headerTitle: 'Welcome Aboard!',
        year: new Date().getFullYear(),
        contactEmail: 'support@rideandpark.com',
      });

      const mailOptions = {
        from: `"Ride and Park" <${this.configService.get<string>('GMAIL_USER')}>`,
        to: email,
        subject: 'Welcome to Ride and Park! 🎉',
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
        from: `"Ride and Park" <${this.configService.get<string>('GMAIL_USER')}>`,
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
