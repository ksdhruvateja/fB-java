/**
 * Domain-driven restructure for FixBridge Spring Boot.
 * Moves files, rewrites package + imports. No behavior changes.
 * Run: node scripts/restructure-backend.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../backend/src');
const MAIN = path.join(ROOT, 'main/java');
const TEST = path.join(ROOT, 'test/java');

/** simpleName → new package (without trailing class) */
const CLASS_PKG = {
  // root
  FixbridgeApiApplication: 'com.fixbridge',
  FixBridgeApplication: 'com.fixbridge',

  // config
  AppConfig: 'com.fixbridge.config',
  AsyncConfig: 'com.fixbridge.config',
  CorsConfig: 'com.fixbridge.config',
  FixbridgeProperties: 'com.fixbridge.config',
  WebMvcConfig: 'com.fixbridge.config',
  SecurityConfig: 'com.fixbridge.config',
  JacksonConfig: 'com.fixbridge.config',
  AiConfig: 'com.fixbridge.config',

  // security
  JwtService: 'com.fixbridge.security.jwt',
  JwtAuthenticationFilter: 'com.fixbridge.security.filter',
  UserPrincipal: 'com.fixbridge.security.principal',
  SecurityUtils: 'com.fixbridge.security.authorization',
  RbacPermissions: 'com.fixbridge.security.authorization',
  ManagedJobAccess: 'com.fixbridge.security.authorization',

  // exception / common
  ApiException: 'com.fixbridge.exception',
  ErrorResponse: 'com.fixbridge.exception',
  GlobalExceptionHandler: 'com.fixbridge.exception',
  MoneyUtil: 'com.fixbridge.common.util',
  DiscountMath: 'com.fixbridge.common.util',
  AddressFormat: 'com.fixbridge.common.util',
  SimpleRateLimiter: 'com.fixbridge.common.util',

  // auth
  AuthController: 'com.fixbridge.auth.controller',
  GoogleAuthController: 'com.fixbridge.auth.controller',
  MfaController: 'com.fixbridge.auth.controller',
  AuthService: 'com.fixbridge.auth.service',
  GoogleAuthService: 'com.fixbridge.auth.service',
  MfaService: 'com.fixbridge.auth.service',
  UserEntity: 'com.fixbridge.auth.entity',
  PasswordResetTokenEntity: 'com.fixbridge.auth.entity',
  MfaChallengeEntity: 'com.fixbridge.auth.entity',
  UserRepository: 'com.fixbridge.auth.repository',
  PasswordResetTokenRepository: 'com.fixbridge.auth.repository',
  MfaChallengeRepository: 'com.fixbridge.auth.repository',
  UserMapper: 'com.fixbridge.auth.mapper',
  ApiMessage: 'com.fixbridge.auth.dto.response',
  AuthResponse: 'com.fixbridge.auth.dto.response',
  UserDto: 'com.fixbridge.auth.dto.response',
  SignInRequest: 'com.fixbridge.auth.dto.request',
  SignUpRequest: 'com.fixbridge.auth.dto.request',
  ForgotPasswordRequest: 'com.fixbridge.auth.dto.request',
  ResetPasswordRequest: 'com.fixbridge.auth.dto.request',
  ProfileUpdateRequest: 'com.fixbridge.auth.dto.request',
  GoogleAuthRequest: 'com.fixbridge.auth.dto.request',

  // property
  PropertyController: 'com.fixbridge.property.controller',
  PropertyService: 'com.fixbridge.property.service',
  PropertyDocumentService: 'com.fixbridge.property.service',
  PropertyEntity: 'com.fixbridge.property.entity',
  PropertyDocumentEntity: 'com.fixbridge.property.entity',
  PropertyRepository: 'com.fixbridge.property.repository',
  PropertyDocumentRepository: 'com.fixbridge.property.repository',
  PropertyMapper: 'com.fixbridge.property.mapper',
  PropertyCreateRequest: 'com.fixbridge.property.dto.request',
  PropertyUpdateRequest: 'com.fixbridge.property.dto.request',
  PropertyDto: 'com.fixbridge.property.dto.response',

  // servicecatalog
  ServiceCatalogController: 'com.fixbridge.servicecatalog.controller',
  ServiceCatalogService: 'com.fixbridge.servicecatalog.service',
  ServiceOfferingEntity: 'com.fixbridge.servicecatalog.entity',
  ServiceOfferingRepository: 'com.fixbridge.servicecatalog.repository',
  ServiceOfferingDto: 'com.fixbridge.servicecatalog.dto',
  ServiceOfferingUpdateRequest: 'com.fixbridge.servicecatalog.dto',

  // job (+ public intake)
  ManagedJobController: 'com.fixbridge.job.controller',
  PublicJobController: 'com.fixbridge.job.controller',
  HealthController: 'com.fixbridge.common.controller',
  ManagedJobService: 'com.fixbridge.job.service',
  AssessmentService: 'com.fixbridge.job.service',
  AssessmentWorkerService: 'com.fixbridge.job.service',
  ManagedJobEntity: 'com.fixbridge.job.entity',
  JobInvitationEntity: 'com.fixbridge.job.entity',
  BidEntity: 'com.fixbridge.job.entity',
  ManagedJobRepository: 'com.fixbridge.job.repository',
  JobInvitationRepository: 'com.fixbridge.job.repository',
  BidRepository: 'com.fixbridge.job.repository',
  ManagedJobMapper: 'com.fixbridge.job.mapper',
  ManagedJobCreateRequest: 'com.fixbridge.job.dto.request',
  CancelJobRequest: 'com.fixbridge.job.dto.request',
  HomeownerUpdateRequest: 'com.fixbridge.job.dto.request',
  PublicJobRequest: 'com.fixbridge.job.dto.request',
  InviteContractorRequest: 'com.fixbridge.job.dto.request',
  AssignContractorRequest: 'com.fixbridge.job.dto.request',
  InvitationRespondRequest: 'com.fixbridge.job.dto.request',
  ManagedJobDto: 'com.fixbridge.job.dto.response',

  // dispatch
  ContractorController: 'com.fixbridge.dispatch.controller',
  ContractorOpsService: 'com.fixbridge.dispatch.service',
  AdminOpsService: 'com.fixbridge.dispatch.service',
  WorkQueueClassifier: 'com.fixbridge.dispatch.service',
  ContractorOpsServiceInvitationTest: 'com.fixbridge.dispatch.service',
  ManagedJobAccessTest: 'com.fixbridge.security.authorization',
  AuthServiceTest: 'com.fixbridge.auth.service',
  PropertyServiceTest: 'com.fixbridge.property.service',
  PropertyDocumentServiceTest: 'com.fixbridge.property.service',
  WorkQueueClassifierTest: 'com.fixbridge.dispatch.service',
  DiscountMathTest: 'com.fixbridge.common.util',

  // fixa
  AiController: 'com.fixbridge.fixa.controller',
  FixaService: 'com.fixbridge.fixa.service',
  AiProvider: 'com.fixbridge.fixa.provider.common',
  AiCompletionResult: 'com.fixbridge.fixa.provider.common',
  OpenAiCompatibleProvider: 'com.fixbridge.fixa.provider.openai',
  ExplabsProvider: 'com.fixbridge.fixa.provider.experientiallabs',
  OpenRouterProvider: 'com.fixbridge.fixa.provider.openrouter',
  AiProviderRouter: 'com.fixbridge.fixa.router',
  AssessmentResult: 'com.fixbridge.fixa.dto.response',

  // diy
  DiyProjectController: 'com.fixbridge.diy.controller',
  DiySafetyController: 'com.fixbridge.diy.controller',
  DiyProjectService: 'com.fixbridge.diy.service',
  DiySafetyService: 'com.fixbridge.diy.service',
  DiyProjectEntity: 'com.fixbridge.diy.entity',
  DiySafetyEventEntity: 'com.fixbridge.diy.entity',
  DiyProjectRepository: 'com.fixbridge.diy.repository',
  DiySafetyEventRepository: 'com.fixbridge.diy.repository',

  // contractor
  ContractorStripeController: 'com.fixbridge.contractor.controller',
  ContractorStripeService: 'com.fixbridge.contractor.service',

  // contractorteam
  ContractorTeamController: 'com.fixbridge.contractorteam.controller',
  ContractorEmployeeService: 'com.fixbridge.contractorteam.service',
  AvailabilityService: 'com.fixbridge.contractorteam.service',
  ContractorEmployeeEntity: 'com.fixbridge.contractorteam.entity',
  ContractorAvailabilityEntity: 'com.fixbridge.contractorteam.entity',
  ContractorEmployeeRepository: 'com.fixbridge.contractorteam.repository',
  ContractorAvailabilityRepository: 'com.fixbridge.contractorteam.repository',

  // compliance
  ComplianceController: 'com.fixbridge.compliance.controller',
  ContractorComplianceService: 'com.fixbridge.compliance.service',
  ComplianceConstants: 'com.fixbridge.compliance.enums',
  ContractorComplianceDocumentEntity: 'com.fixbridge.compliance.entity',
  ContractorComplianceEventEntity: 'com.fixbridge.compliance.entity',
  ContractorComplianceDocumentRepository: 'com.fixbridge.compliance.repository',
  ContractorComplianceEventRepository: 'com.fixbridge.compliance.repository',

  // quote
  QuoteService: 'com.fixbridge.quote.service',
  AdminQuoteWorkspaceService: 'com.fixbridge.quote.service',
  ProposalEntity: 'com.fixbridge.quote.entity',
  QuoteRevisionSnapshotEntity: 'com.fixbridge.quote.entity',
  ProposalRepository: 'com.fixbridge.quote.repository',
  QuoteRevisionSnapshotRepository: 'com.fixbridge.quote.repository',
  ProposalMapper: 'com.fixbridge.quote.mapper',

  // changeorder
  ChangeOrderService: 'com.fixbridge.changeorder.service',
  ChangeOrderEntity: 'com.fixbridge.changeorder.entity',
  ChangeOrderRepository: 'com.fixbridge.changeorder.repository',
  ChangeOrderMapper: 'com.fixbridge.changeorder.mapper',

  // payment
  PaymentController: 'com.fixbridge.payment.controller',
  CheckoutController: 'com.fixbridge.payment.controller',
  StripeWebhookController: 'com.fixbridge.payment.controller',
  DiscountCouponController: 'com.fixbridge.payment.controller',
  PaymentService: 'com.fixbridge.payment.service',
  CheckoutService: 'com.fixbridge.payment.service',
  CheckoutPricingService: 'com.fixbridge.payment.service',
  StripeWebhookService: 'com.fixbridge.payment.service',
  DiscountService: 'com.fixbridge.payment.service',
  JobTipService: 'com.fixbridge.payment.service',
  AdminPaymentOpsService: 'com.fixbridge.payment.service',
  StripeConfig: 'com.fixbridge.payment.stripe.common',
  StripeService: 'com.fixbridge.payment.stripe.common',
  PaymentEntity: 'com.fixbridge.payment.entity',
  PaymentAuthorizationSnapshotEntity: 'com.fixbridge.payment.entity',
  WebhookEventEntity: 'com.fixbridge.payment.entity',
  DiscountCodeEntity: 'com.fixbridge.payment.entity',
  JobTipEntity: 'com.fixbridge.payment.entity',
  RefundEntity: 'com.fixbridge.payment.entity',
  FinancialLedgerEventEntity: 'com.fixbridge.payment.entity',
  PaymentRepository: 'com.fixbridge.payment.repository',
  PaymentAuthorizationSnapshotRepository: 'com.fixbridge.payment.repository',
  WebhookEventRepository: 'com.fixbridge.payment.repository',
  DiscountCodeRepository: 'com.fixbridge.payment.repository',
  JobTipRepository: 'com.fixbridge.payment.repository',
  RefundRepository: 'com.fixbridge.payment.repository',
  FinancialLedgerEventRepository: 'com.fixbridge.payment.repository',

  // payout
  PayoutOpsService: 'com.fixbridge.payout.service',
  ContractorPayoutEntity: 'com.fixbridge.payout.entity',
  PayoutSettingsEntity: 'com.fixbridge.payout.entity',
  PayoutAuditLogEntity: 'com.fixbridge.payout.entity',
  ContractorPayoutRepository: 'com.fixbridge.payout.repository',
  PayoutSettingsRepository: 'com.fixbridge.payout.repository',
  PayoutAuditLogRepository: 'com.fixbridge.payout.repository',

  // subscription
  SubscriptionController: 'com.fixbridge.subscription.controller',
  SubscriptionService: 'com.fixbridge.subscription.service',
  HomecareConfigService: 'com.fixbridge.subscription.service',
  RecurringServiceOpsService: 'com.fixbridge.subscription.service',
  SubscriptionEntity: 'com.fixbridge.subscription.entity',
  SubscriptionPlanEntity: 'com.fixbridge.subscription.entity',
  HomecareSettingsEntity: 'com.fixbridge.subscription.entity',
  RecurringServiceEntity: 'com.fixbridge.subscription.entity',
  SubscriptionRepository: 'com.fixbridge.subscription.repository',
  SubscriptionPlanRepository: 'com.fixbridge.subscription.repository',
  HomecareSettingsRepository: 'com.fixbridge.subscription.repository',
  RecurringServiceRepository: 'com.fixbridge.subscription.repository',

  // messaging
  MessagingController: 'com.fixbridge.messaging.controller',
  MessagingService: 'com.fixbridge.messaging.service',
  ConversationEntity: 'com.fixbridge.messaging.entity',
  MessageEntity: 'com.fixbridge.messaging.entity',
  MessageAttachmentEntity: 'com.fixbridge.messaging.entity',
  ConversationReadCursorEntity: 'com.fixbridge.messaging.entity',
  ConversationRepository: 'com.fixbridge.messaging.repository',
  MessageRepository: 'com.fixbridge.messaging.repository',
  MessageAttachmentRepository: 'com.fixbridge.messaging.repository',
  ConversationReadCursorRepository: 'com.fixbridge.messaging.repository',

  // notification
  NotificationController: 'com.fixbridge.notification.controller',
  NotificationService: 'com.fixbridge.notification.service',
  NotificationEntity: 'com.fixbridge.notification.entity',
  NotificationRepository: 'com.fixbridge.notification.repository',
  NotificationMapper: 'com.fixbridge.notification.mapper',
  NotificationDto: 'com.fixbridge.notification.dto',

  // support
  SupportTicketController: 'com.fixbridge.support.controller',
  SupportTicketService: 'com.fixbridge.support.service',
  SupportTicketEntity: 'com.fixbridge.support.entity',
  SupportTicketMessageEntity: 'com.fixbridge.support.entity',
  SupportTicketRepository: 'com.fixbridge.support.repository',
  SupportTicketMessageRepository: 'com.fixbridge.support.repository',

  // dispute
  DisputeOpsService: 'com.fixbridge.dispute.service',
  DisputeEntity: 'com.fixbridge.dispute.entity',
  DisputeEventEntity: 'com.fixbridge.dispute.entity',
  DisputeRepository: 'com.fixbridge.dispute.repository',
  DisputeEventRepository: 'com.fixbridge.dispute.repository',

  // admin
  AdminController: 'com.fixbridge.admin.controller',
  AdminFinanceController: 'com.fixbridge.admin.controller',
  PricingRulesController: 'com.fixbridge.admin.controller',
  LegalConsentController: 'com.fixbridge.admin.controller',
  ReferralPartnerController: 'com.fixbridge.admin.controller',
  AdminDirectoryService: 'com.fixbridge.admin.service',
  AuditService: 'com.fixbridge.admin.service',
  LegalConsentService: 'com.fixbridge.admin.service',
  PricingRulesService: 'com.fixbridge.admin.service',
  ReferralService: 'com.fixbridge.admin.service',
  PartnerService: 'com.fixbridge.admin.service',
  AuditLogEntity: 'com.fixbridge.admin.entity',
  PricingRulesEntity: 'com.fixbridge.admin.entity',
  LegalDocumentVersionEntity: 'com.fixbridge.admin.entity',
  HomeownerAcceptanceEntity: 'com.fixbridge.admin.entity',
  PartnerEntity: 'com.fixbridge.admin.entity',
  PartnerUserEntity: 'com.fixbridge.admin.entity',
  ReferralCodeMetaEntity: 'com.fixbridge.admin.entity',
  ReferralCreditEntity: 'com.fixbridge.admin.entity',
  ReferralRelationshipEntity: 'com.fixbridge.admin.entity',
  AuditLogRepository: 'com.fixbridge.admin.repository',
  PricingRulesRepository: 'com.fixbridge.admin.repository',
  LegalDocumentVersionRepository: 'com.fixbridge.admin.repository',
  HomeownerAcceptanceRepository: 'com.fixbridge.admin.repository',
  PartnerRepository: 'com.fixbridge.admin.repository',
  PartnerUserRepository: 'com.fixbridge.admin.repository',
  ReferralCodeMetaRepository: 'com.fixbridge.admin.repository',
  ReferralCreditRepository: 'com.fixbridge.admin.repository',
  ReferralRelationshipRepository: 'com.fixbridge.admin.repository',

  // file
  MediaController: 'com.fixbridge.file.controller',
  MediaService: 'com.fixbridge.file.service',
  MediaObjectEntity: 'com.fixbridge.file.entity',
  MediaObjectRepository: 'com.fixbridge.file.repository',

  // integration
  GeoapifyClient: 'com.fixbridge.integration.geoapify',
  AddressController: 'com.fixbridge.integration.geoapify',
  ServiceAreaController: 'com.fixbridge.integration.geoapify',
  ServiceAreaService: 'com.fixbridge.integration.geoapify',
  MailService: 'com.fixbridge.integration.email',
  MailResult: 'com.fixbridge.integration.email',
  HighLevelClient: 'com.fixbridge.integration.highlevel',
};

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (ent.name.endsWith('.java')) acc.push(p);
  }
  return acc;
}

function simpleName(filePath) {
  return path.basename(filePath, '.java');
}

function pkgToDir(pkg) {
  return pkg.replace(/\./g, path.sep);
}

function rewriteContent(content, nameToPkg) {
  // package declaration
  let out = content.replace(/^package\s+[\w.]+;/m, (m) => {
    // will set later per file
    return m;
  });

  // Rewrite imports: import com.fixbridge....ClassName;
  out = out.replace(
    /import\s+(static\s+)?(com\.fixbridge(?:\.[\w]+)*)\.(\w+)\s*;/g,
    (full, stat, oldPkg, cls) => {
      const np = nameToPkg[cls];
      if (!np) return full;
      return `import ${stat || ''}${np}.${cls};`;
    }
  );

  // Fully-qualified references rarely used; skip for safety
  return out;
}

function main() {
  const nameToPkg = { ...CLASS_PKG };
  const files = [...walk(MAIN), ...walk(TEST)];
  const unmapped = [];
  const moves = [];

  for (const file of files) {
    const name = simpleName(file);
    let pkg = nameToPkg[name];
    if (!pkg) {
      // tests: map AuthServiceTest → same as AuthService under test tree with .test inferred by path
      if (name.endsWith('Test')) {
        const base = name.slice(0, -4);
        if (nameToPkg[base]) {
          pkg = nameToPkg[base];
          nameToPkg[name] = pkg;
        } else {
          // e.g. ContractorOpsServiceInvitationTest → ContractorOpsService
          for (const [cls, p] of Object.entries(nameToPkg)) {
            if (name.startsWith(cls) && cls.length > 3) {
              pkg = p;
              nameToPkg[name] = pkg;
              break;
            }
          }
        }
      }
    }
    if (!pkg) {
      unmapped.push(file);
      continue;
    }
    moves.push({ file, name, pkg });
  }

  if (unmapped.length) {
    console.error('UNMAPPED FILES:');
    unmapped.forEach((f) => console.error(' ', f));
    process.exit(1);
  }

  // Build old FQN → new FQN for import rewrite (from reading package line)
  const oldFqnToNew = new Map();
  for (const { file, name, pkg } of moves) {
    const text = fs.readFileSync(file, 'utf8');
    const m = text.match(/^package\s+([\w.]+);/m);
    if (m) oldFqnToNew.set(`${m[1]}.${name}`, `${pkg}.${name}`);
  }

  // Also map any class by simple name for import lines
  const importRewrite = (text) => {
    return text.replace(
      /import\s+(static\s+)?([\w.]+)\.(\w+)\s*;/g,
      (full, stat, pkgPart, cls) => {
        const np = nameToPkg[cls];
        if (!np) return full;
        if (!pkgPart.startsWith('com.fixbridge')) return full;
        return `import ${stat || ''}${np}.${cls};`;
      }
    );
  };

  const staging = path.join(ROOT, '../.restructure-staging');
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });

  for (const { file, name, pkg } of moves) {
    const isTest = file.includes(`${path.sep}test${path.sep}`);
    const baseRoot = isTest ? path.join(staging, 'test/java') : path.join(staging, 'main/java');
    const destDir = path.join(baseRoot, pkgToDir(pkg));
    fs.mkdirSync(destDir, { recursive: true });
    let destName = name;
    // Rename application class file
    if (name === 'FixbridgeApiApplication') {
      destName = 'FixBridgeApplication';
    }
    let text = fs.readFileSync(file, 'utf8');
    text = text.replace(/^package\s+[\w.]+;/m, `package ${pkg};`);
    text = importRewrite(text);
    if (name === 'FixbridgeApiApplication') {
      text = text.replace(/class\s+FixbridgeApiApplication/g, 'class FixBridgeApplication');
      text = text.replace(/FixbridgeApiApplication\.class/g, 'FixBridgeApplication.class');
    }
    fs.writeFileSync(path.join(destDir, `${destName}.java`), text);
  }

  // Replace main/java and test/java
  const mainJava = MAIN;
  const testJava = TEST;
  fs.rmSync(mainJava, { recursive: true, force: true });
  fs.mkdirSync(mainJava, { recursive: true });
  copyDir(path.join(staging, 'main/java'), mainJava);
  if (fs.existsSync(path.join(staging, 'test/java'))) {
    fs.rmSync(testJava, { recursive: true, force: true });
    fs.mkdirSync(testJava, { recursive: true });
    copyDir(path.join(staging, 'test/java'), testJava);
  }
  fs.rmSync(staging, { recursive: true, force: true });

  // Second pass: fix any remaining old package imports by scanning
  const allNew = [...walk(MAIN), ...walk(TEST)];
  for (const file of allNew) {
    let text = fs.readFileSync(file, 'utf8');
    const next = importRewrite(text);
    // Fix SpringBootApplication run class name if needed
    if (file.endsWith('FixBridgeApplication.java')) {
      // ok
    }
    if (next !== text) fs.writeFileSync(file, next);
  }

  console.log(`Moved ${moves.length} files into domain packages.`);
  console.log('Domains:', [...new Set(moves.map((m) => m.pkg.split('.').slice(0, 3).join('.')))].sort().join(', '));
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

main();
