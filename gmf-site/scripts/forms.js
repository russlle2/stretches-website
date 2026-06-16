// forms.js — Supabase-backed form submissions via Netlify Functions
document.addEventListener('DOMContentLoaded', () => {
  bindForm('newsletter-form', async (data) => {
    await window.GMF_API.subscribeNewsletter(data.email);
    return 'You\'re on the list. New drops and music coming your way.';
  });

  bindForm('contact-form', async (data) => {
    await window.GMF_API.submitContact({
      name: data.name,
      email: data.email,
      subject: data.subject,
      message: data.message,
    });
    return 'Message sent. We\'ll get back within 24–48 hours.';
  });

  bindForm('booking-form', async (data) => {
    await window.GMF_API.submitBooking({
      name: data.name,
      email: data.email,
      eventDate: data.eventDate || data.eventdate,
      message: data.message,
    });
    return 'Booking inquiry submitted. Our team will reach out shortly.';
  });
});

function bindForm(id, submitFn) {
  const form = document.getElementById(id);
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const status = form.querySelector('.form-status');
    const originalText = btn?.textContent;

    const data = Object.fromEntries(new FormData(form).entries());

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Sending...';
    }
    if (status) status.textContent = '';

    try {
      const message = await submitFn(data);
      form.reset();
      if (status) {
        status.textContent = message;
        status.className = 'form-status text-brand-green mt-4';
      }
    } catch (err) {
      if (status) {
        status.textContent = err.message || 'Something went wrong. Try again.';
        status.className = 'form-status text-red-400 mt-4';
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }
  });
}
