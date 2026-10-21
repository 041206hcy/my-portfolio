// 年份自动更新
document.getElementById('year').textContent = new Date().getFullYear();

// 滚动淡入
const targets = document.querySelectorAll('.card, .note, .skills__group, .section__text');
targets.forEach(el => el.classList.add('reveal'));

const io = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('is-visible');
      io.unobserve(e.target);
    }
  });
}, { threshold: 0.12 });

targets.forEach(el => io.observe(el));