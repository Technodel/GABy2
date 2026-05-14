import { useState, useEffect } from 'react';

type Lang = 'en' | 'ar';

export default function About() {
  const [lang, setLang] = useState<Lang>(() => {
    const browserLang = navigator.language.split('-')[0];
    return browserLang === 'ar' ? 'ar' : 'en';
  });

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: 32 }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        {/* Language toggle */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24, gap: 8 }}>
          <button
            className="btn btn-sm"
            onClick={() => setLang('en')}
            style={{
              background: lang === 'en' ? 'var(--accent)' : 'var(--surface)',
              color: lang === 'en' ? '#fff' : 'var(--text-secondary)',
              border: '1px solid var(--border)',
            }}
          >
            🇬🇧 English
          </button>
          <button
            className="btn btn-sm"
            onClick={() => setLang('ar')}
            style={{
              background: lang === 'ar' ? 'var(--accent)' : 'var(--surface)',
              color: lang === 'ar' ? '#fff' : 'var(--text-secondary)',
              border: '1px solid var(--border)',
            }}
          >
            🇱🇧 العربية
          </button>
        </div>

        {lang === 'en' ? <EnglishContent /> : <ArabicContent />}
      </div>
    </div>
  );
}

function EnglishContent() {
  return (
    <div className="page-enter">
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>👋 Meet GABy — Your Personal Coding Sidekick</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 32, fontSize: 15, lineHeight: 1.7 }}>
        GABy isn't just a tool. GABy is the coding buddy you always wished you had — one that never gets tired,
        never judges your questions, and doesn't stop until your project is done.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>What can GABy do for you?</h2>

      {[
        { icon: '🎯', title: 'You give the goal. GABy does the rest.', desc: "Just tell GABy what you want — \"build me a login page\", \"fix the bug in my checkout flow\", \"add dark mode to my app\" — and GABy takes it from there. No commands, no code to copy-paste, no guesswork." },
        { icon: '🔍', title: 'It reads your entire project', desc: 'GABy explores your project automatically to understand how everything fits together before touching a single file.' },
        { icon: '✏️', title: 'It writes, edits & creates files', desc: "GABy can create new files, modify existing ones, and organize your project — all without you lifting a finger." },
        { icon: '🔧', title: 'It handles the hard stuff automatically', desc: 'GABy runs everything behind the scenes while it keeps you in the loop with friendly, plain-English updates.' },
        { icon: '🔄', title: 'It doesn\'t give up', desc: "If something doesn't work the first time, GABy tries a different approach. It keeps going until it gets it right — or tells you clearly what's blocking it." },
        { icon: '📁', title: 'Multiple Projects', desc: 'Work on as many projects as you need. GABy keeps everything organized and separate.' },
        { icon: '🧠', title: 'It gets smarter the more you use it', desc: 'GABy remembers your preferences, your project style, and your past decisions — so every session feels like working with someone who already knows you.' },
        { icon: '💬', title: 'Plain English, always', desc: "No tech jargon. GABy explains what it's doing in a way that actually makes sense." },
        { icon: '💰', title: "You're in control of your budget", desc: 'Your admin sets a credit balance for you. GABy shows you what you have left at all times — no surprise charges.' },
      ].map(f => (
        <div key={f.icon} className="card" style={{ marginBottom: 12 }}>
          <h3 style={{ fontWeight: 600, marginBottom: 6 }}>{f.icon} {f.title}</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>{f.desc}</p>
        </div>
      ))}

      <div className="card" style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>What Makes GABy Different From Just Using ChatGPT?</h2>
        <table>
          <thead>
            <tr>
              <th>ChatGPT / Regular AI</th>
              <th>GABy</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Gives you code to copy-paste', 'Actually writes the files in your project'],
              ['You run the commands yourself', 'GABy runs everything automatically'],
              ['Stops after one answer', 'Keeps going until the full goal is done'],
              ['Technical interface', 'Plain English, friendly, no jargon'],
            ].map(([old, gaby]) => (
              <tr key={old}>
                <td style={{ color: 'var(--text-muted)' }}>{old}</td>
                <td style={{ color: 'var(--success)' }}>{gaby}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 24, borderColor: 'var(--success,#22c55e)', background: 'rgba(34,197,94,0.04)' }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>💸 Costs More or Less?</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.7 }}>
          GABy is <strong>surprisingly affordable</strong>. Most tasks cost just a few cents — not because we cut corners,
          but because we built it smart. You only pay for what GABy actually does, and we keep the pricing transparent.
          You always see your credit balance — no surprise charges, ever.
        </p>
      </div>

      <div style={{ marginTop: 16, padding: '20px 24px', borderRadius: 'var(--radius)', border: '1px solid var(--accent)', background: 'rgba(108,99,255,0.06)' }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 10 }}>🎯 Is the result guaranteed?</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.7 }}>
          Yes — GABy doesn't give up after one attempt. It tests, evaluates, retries, and keeps going until the goal
          is done. If something blocks it, it tells you clearly and tries a different approach.
          <strong> It works the same way a skilled human developer would</strong> — not by handing you a script, but by
          actually doing the work, running it, checking it, and fixing it until it works.
        </p>
      </div>
    </div>
  );
}

function ArabicContent() {
  return (
    <div dir="rtl" className="page-enter" style={{ fontFamily: "'Noto Sans Arabic', Inter, sans-serif" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>👋 تعرّف على GABy — مساعدك الشخصي في البرمجة</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 32, fontSize: 15, lineHeight: 1.8 }}>
        GABy ليس مجرد أداة. GABy هو رفيق البرمجة الذي كنت دائمًا تتمنى وجوده — لا يتعب، لا يحكم عليك، ولا يتوقف حتى يُنجز مشروعك.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>ماذا يمكن لـ GABy أن يفعل من أجلك؟</h2>

      {[
        { icon: '🎯', title: 'أنت تحدد الهدف. GABy يتكفّل بالباقي.', desc: "فقط أخبر GABy بما تريد — \"ابنِ لي صفحة تسجيل دخول\"، \"أصلح الخطأ في صفحة الدفع\"، \"أضف الوضع الليلي لتطبيقي\" — وGABy يتولى الأمر من هناك. لا أوامر، لا نسخ ولصق، لا تخمين." },
        { icon: '🔍', title: 'يقرأ مشروعك بالكامل', desc: 'يستكشف GABy مشروعك تلقائيًا ويفهم كيف يرتبط كل شيء ببعضه قبل أن يلمس أي ملف.' },
        { icon: '✏️', title: 'يكتب، يعدّل، وينشئ الملفات', desc: 'يستطيع GABy إنشاء ملفات جديدة، تعديل الموجودة، وتنظيم مشروعك — كل ذلك دون أن تحرك إصبعًا.' },
        { icon: '🔧', title: 'يتعامل مع الأمور الصعبة تلقائيًا', desc: 'يُنجز GABy كل شيء خلف الكواليس، ويُبقيك على اطلاع بتحديثات ودية وبلغة بسيطة.' },
        { icon: '🔄', title: 'لا يستسلم', desc: 'إذا لم ينجح الأمر من المحاولة الأولى، يجرّب GABy نهجًا مختلفًا. يستمر حتى يصل إلى الحل — أو يوضّح لك بدقة ما الذي يعيق التقدم.' },
        { icon: '📁', title: 'مشاريع متعددة', desc: 'اعمل على أي عدد من المشاريع تريد. GABy يُبقي كل شيء منظمًا ومنفصلًا.' },
        { icon: '🧠', title: 'يصبح أذكى كلما استخدمته أكثر', desc: 'يتذكر GABy تفضيلاتك وأسلوب عملك وقراراتك السابقة — حتى تشعر في كل جلسة أنك تعمل مع شخص يعرفك جيدًا.' },
        { icon: '💬', title: 'لغة بسيطة دائمًا', desc: 'لا مصطلحات تقنية. GABy يشرح ما يفعله بطريقة مفهومة ومريحة.' },
        { icon: '💰', title: 'أنت في السيطرة على ميزانيتك', desc: 'يحدد المسؤول رصيدًا لك. GABy يُريك ما تبقى لديك في كل وقت — لا مفاجآت في الفواتير.' },
      ].map(f => (
        <div key={f.icon} className="card" style={{ marginBottom: 12 }}>
          <h3 style={{ fontWeight: 600, marginBottom: 6 }}>{f.icon} {f.title}</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.8 }}>{f.desc}</p>
        </div>
      ))}

      <div className="card" style={{ marginTop: 24, borderColor: 'var(--success,#22c55e)', background: 'rgba(34,197,94,0.04)' }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>💸 هل التكلفة مرتفعة؟</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.8 }}>
          GABy <strong>ميسور التكلفة بشكل مفاجئ</strong>. معظم المهام لا تتجاوز بضعة سنتات — ليس لأننا نتنازل عن الجودة،
          بل لأننا بنيناه بذكاء. أنت تدفع فقط مقابل ما يفعله GABy فعلاً، وتبقى مطلعًا على رصيدك دائمًا — بدون مفاجآت.
        </p>
      </div>

      <div style={{ marginTop: 16, padding: '20px 24px', borderRadius: 'var(--radius)', border: '1px solid var(--accent)', background: 'rgba(108,99,255,0.06)' }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 10 }}>🎯 هل النتيجة مضمونة؟</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.8 }}>
          نعم — GABy لا يستسلم بعد محاولة واحدة. يختبر، يقيّم، يعيد المحاولة، ويستمر حتى يُنجز الهدف.
          إذا واجه عقبة، يخبرك بوضوح ويجرب نهجًا مختلفًا.
          <strong> يعمل تمامًا كما يعمل مطور بشري محترف</strong> — لا يعطيك سكريبتًا لتشغله بنفسك،
          بل يقوم هو بالعمل، يشغّله، يتحقق منه، ويصلحه حتى يعمل بشكل صحيح.
        </p>
      </div>
    </div>
  );
}
