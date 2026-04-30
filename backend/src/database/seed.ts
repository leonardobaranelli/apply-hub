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

// ─────────────────────────────────────────────────────────────────────
//  English templates (language: 'en')
// ─────────────────────────────────────────────────────────────────────
const EN_TEMPLATES: SeedTemplate[] = [
  {
    name: 'Generic cover letter - Backend (EN)',
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
    name: 'Direct application email (EN)',
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
    name: 'LinkedIn - Recruiter connection (EN)',
    type: 'linkedin_connection',
    body: `Hi {{recruiter_name}}, I noticed you're hiring for {{role}} at {{company}}. It looks like a great match for my profile ({{summary}}). I'd love to connect and chat. Thanks!`,
    language: 'en',
    tags: ['linkedin', 'connection'],
    isFavorite: true,
  },
  {
    name: 'LinkedIn - Post Easy Apply message (EN)',
    type: 'linkedin_message',
    body: `Hi {{recruiter_name}}, I just applied to {{role}} at {{company}} via LinkedIn. I wanted to put myself at your disposal in case you need more context about my experience with {{stack}}. Looking forward to hearing from you.`,
    language: 'en',
    tags: ['linkedin', 'follow_up'],
  },
  {
    name: 'Post-interview follow-up (EN)',
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
    name: 'Referral request (EN)',
    type: 'referral_request',
    body: `Hi {{contact_name}}, hope you're doing well. I noticed {{company}} is hiring for {{role}} and I'm really interested in applying. Would you have a minute to share a bit about the team or, if you're up for it, refer me internally? I'm sending my CV/LinkedIn for reference. Thanks a lot!`,
    language: 'en',
    tags: ['referral'],
  },
];

// ─────────────────────────────────────────────────────────────────────
//  Spanish templates (language: 'es')
// ─────────────────────────────────────────────────────────────────────
const ES_TEMPLATES: SeedTemplate[] = [
  {
    name: 'Carta de presentación genérica - Backend (ES)',
    type: 'cover_letter',
    subject: 'Postulación para {{role}} en {{company}}',
    body: `Hola equipo de {{company}},

Mi nombre es {{name}} y me postulo para la posición de {{role}}. Tengo experiencia práctica construyendo APIs con Node.js/NestJS y bases de datos relacionales (PostgreSQL), aplicando principios SOLID, testing y arquitectura limpia.

Algunos puntos destacados:
- {{highlight_1}}
- {{highlight_2}}
- {{highlight_3}}

Me encantaría conversar sobre cómo puedo aportar a {{company}}. Quedo atento a su respuesta.

Saludos,
{{name}}
{{linkedin}}`,
    language: 'es',
    tags: ['backend', 'cover_letter'],
    isFavorite: true,
  },
  {
    name: 'Email de postulación directa (ES)',
    type: 'email',
    subject: 'Postulación para {{role}}',
    body: `Hola {{recruiter_name}},

Vi la búsqueda de {{role}} en {{company}} y quisiera postularme. Adjunto mi CV.

En resumen: tengo experiencia con {{stack}} y proyectos en los que {{achievement}}. Me motiva especialmente {{motivation}}.

¿Podríamos coordinar una breve llamada esta semana?

Gracias,
{{name}}`,
    language: 'es',
    tags: ['email', 'cold_outreach'],
  },
  {
    name: 'LinkedIn - Conexión con recruiter (ES)',
    type: 'linkedin_connection',
    body: `Hola {{recruiter_name}}, vi que están buscando {{role}} en {{company}}. Parece una excelente coincidencia con mi perfil ({{summary}}). Me encantaría conectar y conversar. ¡Gracias!`,
    language: 'es',
    tags: ['linkedin', 'connection'],
    isFavorite: true,
  },
  {
    name: 'LinkedIn - Mensaje post Easy Apply (ES)',
    type: 'linkedin_message',
    body: `Hola {{recruiter_name}}, acabo de postularme a {{role}} en {{company}} vía LinkedIn. Quería ponerme a tu disposición por si necesitás más contexto sobre mi experiencia con {{stack}}. Quedo atento.`,
    language: 'es',
    tags: ['linkedin', 'follow_up'],
  },
  {
    name: 'Follow-up post entrevista (ES)',
    type: 'follow_up',
    subject: 'Gracias por la entrevista - {{role}}',
    body: `Hola {{interviewer_name}},

Gracias por la conversación de hoy sobre {{role}}. Disfruté mucho la charla y estoy entusiasmado con los próximos pasos.

Estuve pensando en {{topic}} y quería compartir algunas ideas: {{thoughts}}.

Si necesitan algo más de mi parte, quedo atento.

Saludos,
{{name}}`,
    language: 'es',
    tags: ['follow_up', 'thank_you'],
  },
  {
    name: 'Pedido de referido (ES)',
    type: 'referral_request',
    body: `Hola {{contact_name}}, espero que estés muy bien. Vi que {{company}} está buscando {{role}} y me interesa mucho postularme. ¿Tendrías un minuto para contarme un poco sobre el equipo o, si te animás, referirme internamente? Te paso mi CV/LinkedIn como referencia. ¡Mil gracias!`,
    language: 'es',
    tags: ['referral'],
  },
];

const SEED_TEMPLATES: SeedTemplate[] = [...EN_TEMPLATES, ...ES_TEMPLATES];

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
