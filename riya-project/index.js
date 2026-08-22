const navItems = document.querySelectorAll('.nav-item[data-section]');
const sections = document.querySelectorAll('.page-section');
const breadcrumbCurrent = document.querySelector('#breadcrumb-current');
const sidebar = document.querySelector('.sidebar');
const modalBackdrop = document.querySelector('#internship-modal');
const toast = document.querySelector('#toast');

function showSection(sectionId) {
	sections.forEach((section) => section.classList.toggle('active-section', section.id === sectionId));
	navItems.forEach((item) => item.classList.toggle('active', item.dataset.section === sectionId));
	const activeItem = document.querySelector(`.nav-item[data-section="${sectionId}"]`);
	breadcrumbCurrent.textContent = activeItem ? activeItem.textContent.trim().replace(/^\S+\s/, '') : 'Overview';
	sidebar.classList.remove('open');
	window.scrollTo({ top: 0, behavior: 'smooth' });
}

navItems.forEach((item) => item.addEventListener('click', () => showSection(item.dataset.section)));
document.querySelectorAll('[data-section-target]').forEach((button) => button.addEventListener('click', () => showSection(button.dataset.sectionTarget)));
document.querySelectorAll('.open-modal').forEach((button) => button.addEventListener('click', () => {
	modalBackdrop.classList.add('visible');
	modalBackdrop.setAttribute('aria-hidden', 'false');
	modalBackdrop.querySelector('input').focus();
}));
document.querySelector('.close-modal').addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', (event) => { if (event.target === modalBackdrop) closeModal(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });
document.querySelector('.mobile-menu').addEventListener('click', () => sidebar.classList.toggle('open'));

function closeModal() {
	modalBackdrop.classList.remove('visible');
	modalBackdrop.setAttribute('aria-hidden', 'true');
}

document.querySelector('#internship-form').addEventListener('submit', (event) => {
	event.preventDefault();
	closeModal();
	event.target.reset();
	toast.classList.add('show');
	window.setTimeout(() => toast.classList.remove('show'), 3200);
});

document.querySelectorAll('.approve-button').forEach((button) => button.addEventListener('click', () => {
	const row = button.closest('.attendance-row');
	button.textContent = 'Approved';
	button.disabled = true;
	row.querySelector('.status-pill').textContent = 'Approved';
	row.querySelector('.status-pill').className = 'status-pill completed';
}));
 