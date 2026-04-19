document.addEventListener('DOMContentLoaded', function () {
    const birthYear = 2001;
    const currentYear = new Date().getFullYear();

    const ageEl = document.getElementById('auto-age');
    if (ageEl) ageEl.innerText = currentYear - birthYear;

    const heroYearEl = document.getElementById('current-year');
    if (heroYearEl) heroYearEl.innerText = currentYear;

    const modal = document.getElementById('story-modal');
    if (!modal) return;

    const modalImg     = document.getElementById('modal-img');
    const modalCaption = document.getElementById('modal-caption');
    const storyContent = document.getElementById('story-content');

    window.openStory = function (imageSrc, captionText) {
        modalImg.src = imageSrc;
        modalCaption.innerText = captionText;
        const len = captionText.length;
        if (len > 300) {
            modalCaption.style.fontSize = '1.25rem';
            modalCaption.style.lineHeight = '1.75';
        } else if (len > 120) {
            modalCaption.style.fontSize = '1.5rem';
            modalCaption.style.lineHeight = '1.65';
        } else {
            modalCaption.style.fontSize = '';
            modalCaption.style.lineHeight = '';
        }
        modal.classList.remove('opacity-0', 'pointer-events-none');
        setTimeout(() => {
            storyContent.classList.remove('scale-95');
            storyContent.classList.add('scale-100');
        }, 50);
        document.body.style.overflow = 'hidden';
    };

    window.closeStory = function () {
        modal.classList.add('opacity-0', 'pointer-events-none');
        storyContent.classList.remove('scale-100');
        storyContent.classList.add('scale-95');
        document.body.style.overflow = 'auto';
    };

    modal.addEventListener('click', function (e) {
        if (e.target === modal) window.closeStory();
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !modal.classList.contains('pointer-events-none'))
            window.closeStory();
    });
});
