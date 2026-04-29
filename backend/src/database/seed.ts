import { PrismaClient, TemplateType } from '@prisma/client';

interface SeedTemplate {
  name: string;
  type: TemplateType;
  subject?: string;
  body: string;
  language?: string;
  tags?: string[];
  isFavorite?: boolean;
}

const SEED_TEMPLATES: SeedTemplate[] = [
  {
    name: 'Generic cover letter - Backend',
    type: 'cover_letter',
    subject: 'Application for {{role}} at {{company}}',
    body: `Hi {{company}} team,

My name is {{name}} and I'm applying for the {{role}} position. I have hands-on experience building APIs with Node.js/NestJS and relational databases (PostgreSQL), applying SOLID principles, testing and clean architecture.

A few highlights:
- {{highlight_1}}
- {{highlight_2}}
- {{highlight_3}}

I would love to chat about how I can contribute to {{company}}. Looking forward to your reply.

Best,
{{name}}
{{linkedin}}`,
    language: 'en',
    tags: ['backend', 'cover_letter'],
    isFavorite: true,
  },
  {
    name: 'Direct application email',
    type: 'email',
    subject: 'Application for {{role}}',
    body: `Hi {{recruiter_name}},

I came across the {{role}} opening at {{company}} and I would like to apply. My CV is attached.

In a nutshell: I have experience with {{stack}} and projects where I {{achievement}}. I'm especially drawn to {{motivation}}.

Could we set up a short call this week?

Thanks,
{{name}}`,
    language: 'en',
    tags: ['email', 'cold_outreach'],
  },
  {
    name: 'LinkedIn - Recruiter connection',
    type: 'linkedin_connection',
    body: `Hi {{recruiter_name}}, I noticed you're hiring for {{role}} at {{company}}. It looks like a great match for my profile ({{summary}}). I'd love to connect and chat. Thanks!`,
    language: 'en',
    tags: ['linkedin', 'connection'],
    isFavorite: true,
  },
  {
    name: 'LinkedIn - Post Easy Apply message',
    type: 'linkedin_message',
    body: `Hi {{recruiter_name}}, I just applied to {{role}} at {{company}} via LinkedIn. I wanted to put myself at your disposal in case you need more context about my experience with {{stack}}. Looking forward to hearing from you.`,
    language: 'en',
    tags: ['linkedin', 'follow_up'],
  },
  {
    name: 'Post-interview follow-up',
    type: 'follow_up',
    subject: 'Thank you for the interview - {{role}}',
    body: `Hi {{interviewer_name}},

Thanks for our chat today about {{role}}. I really enjoyed the conversation and I'm excited about the next steps.

I kept thinking about {{topic}}, here are a few thoughts: {{thoughts}}.

Anything you need from my side, just let me know.

Best,
{{name}}`,
    language: 'en',
    tags: ['follow_up', 'thank_you'],
  },
  {
    name: 'Referral request',
    type: 'referral_request',
    body: `Hi {{contact_name}}, hope you're doing well. I noticed {{company}} is hiring for {{role}} and I'm really interested in applying. Would you have a minute to share a bit about the team or, if you're up for it, refer me internally? I'm sending my CV/LinkedIn for reference. Thanks a lot!`,
    language: 'en',
    tags: ['referral'],
  },
];

async function seed(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    const existing = await prisma.template.count();
    if (existing > 0) {
      console.log(`Templates already seeded (${existing}). Skipping.`);
      return;
    }
    await prisma.template.createMany({ data: SEED_TEMPLATES });
    console.log(`Seeded ${SEED_TEMPLATES.length} templates.`);
  } finally {
    await prisma.$disconnect();
  }
}

seed().catch((err) => {
  console.error('Seed failed', err);
  process.exit(1);
});
