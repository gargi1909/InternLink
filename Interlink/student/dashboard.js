// ============================================================
// INTERNLINK — STUDENT DASHBOARD JAVASCRIPT
// ============================================================

document.addEventListener("DOMContentLoaded", () => {

    /* ========================================================
       MOBILE SIDEBAR
    ======================================================== */

    const sidebar = document.getElementById("sidebar");
    const menuBtn = document.getElementById("menuBtn");
    const scrim = document.getElementById("scrim");

    function openSidebar() {
        if (!sidebar) return;

        sidebar.classList.add("open");

        if (scrim) {
            scrim.classList.add("show");
        }
    }

    function closeSidebar() {
        if (!sidebar) return;

        sidebar.classList.remove("open");

        if (scrim) {
            scrim.classList.remove("show");
        }
    }

    if (menuBtn) {
        menuBtn.addEventListener("click", () => {
            if (sidebar.classList.contains("open")) {
                closeSidebar();
            } else {
                openSidebar();
            }
        });
    }

    if (scrim) {
        scrim.addEventListener("click", closeSidebar);
    }


    /* ========================================================
       CLOSE MOBILE SIDEBAR AFTER NAVIGATION
    ======================================================== */

    const navLinks = document.querySelectorAll(".sidebar nav a");

    navLinks.forEach(link => {
        link.addEventListener("click", () => {

            navLinks.forEach(item => {
                item.classList.remove("active");
            });

            link.classList.add("active");

            if (window.innerWidth <= 760) {
                closeSidebar();
            }
        });
    });


    /* ========================================================
       ANIMATED STAT COUNTERS
    ======================================================== */

    const counters = document.querySelectorAll("[data-count]");

    function animateCounter(element) {

        const target = parseFloat(
            element.getAttribute("data-count")
        );

        const suffix =
            element.getAttribute("data-suffix") || "";

        const duration = 1000;
        const startTime = performance.now();

        function updateCounter(currentTime) {

            const elapsed = currentTime - startTime;

            const progress =
                Math.min(elapsed / duration, 1);

            // Smooth ease-out animation
            const eased =
                1 - Math.pow(1 - progress, 3);

            const value =
                Math.round(target * eased);

            element.textContent =
                value + suffix;

            if (progress < 1) {
                requestAnimationFrame(updateCounter);
            }
        }

        requestAnimationFrame(updateCounter);
    }


    if ("IntersectionObserver" in window) {

        const counterObserver =
            new IntersectionObserver(
                (entries, observer) => {

                    entries.forEach(entry => {

                        if (entry.isIntersecting) {

                            animateCounter(entry.target);

                            observer.unobserve(entry.target);
                        }

                    });

                },
                {
                    threshold: 0.4
                }
            );

        counters.forEach(counter => {
            counterObserver.observe(counter);
        });

    } else {

        counters.forEach(counter => {
            const target =
                counter.getAttribute("data-count");

            const suffix =
                counter.getAttribute("data-suffix") || "";

            counter.textContent =
                target + suffix;
        });
    }


    /* ========================================================
       SKILL PROGRESS BARS
    ======================================================== */

    const skillBars =
        document.querySelectorAll(".bar i");

    function animateSkillBar(bar) {

        const width =
            bar.getAttribute("data-width") ||
            bar.style.getPropertyValue("--w");

        if (width) {
            setTimeout(() => {
                bar.style.width = width;
            }, 150);
        }
    }


    if ("IntersectionObserver" in window) {

        const skillObserver =
            new IntersectionObserver(
                (entries, observer) => {

                    entries.forEach(entry => {

                        if (entry.isIntersecting) {

                            animateSkillBar(entry.target);

                            observer.unobserve(entry.target);
                        }

                    });

                },
                {
                    threshold: 0.3
                }
            );

        skillBars.forEach(bar => {
            skillObserver.observe(bar);
        });

    } else {

        skillBars.forEach(animateSkillBar);

    }


    /* ========================================================
       TODAY'S GOALS
       Saved automatically using localStorage
    ======================================================== */

    const taskList =
        document.getElementById("taskList");

    const goalProgress =
        document.getElementById("goalProgress");

    const STORAGE_KEY =
        "internlink-student-goals";


    function getSavedGoals() {

        try {

            return JSON.parse(
                localStorage.getItem(STORAGE_KEY)
            ) || {};

        } catch (error) {

            return {};

        }
    }


    function saveGoals(data) {

        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(data)
        );

    }


    function updateGoalProgress() {

        if (!taskList || !goalProgress) {
            return;
        }

        const checkboxes =
            taskList.querySelectorAll(
                'input[type="checkbox"]'
            );

        const completed =
            [...checkboxes]
                .filter(box => box.checked)
                .length;

        const total =
            checkboxes.length;

        goalProgress.textContent =
            `${completed}/${total}`;
    }


    if (taskList) {

        const savedGoals =
            getSavedGoals();

        const checkboxes =
            taskList.querySelectorAll(
                'input[type="checkbox"]'
            );


        checkboxes.forEach((checkbox, index) => {

            const taskName =
                checkbox.getAttribute("data-task") ||
                `task-${index}`;

            // Restore previous state
            if (savedGoals[taskName] === true) {
                checkbox.checked = true;
            }


            checkbox.addEventListener(
                "change",
                () => {

                    const currentGoals =
                        getSavedGoals();

                    currentGoals[taskName] =
                        checkbox.checked;

                    saveGoals(currentGoals);

                    updateGoalProgress();

                }
            );

        });

        updateGoalProgress();
    }


    /* ========================================================
       DISMISSIBLE NOTIFICATIONS
    ======================================================== */

    const closeButtons =
        document.querySelectorAll(".note-close");


    closeButtons.forEach(button => {

        button.addEventListener("click", () => {

            const note =
                button.closest(".note");

            if (!note) return;


            note.style.transition =
                "opacity .25s ease, transform .25s ease";

            note.style.opacity = "0";

            note.style.transform =
                "translateX(20px)";


            setTimeout(() => {

                note.remove();

            }, 250);

        });

    });


    /* ========================================================
       SEARCH
    ======================================================== */

    const searchInput =
        document.querySelector(".search-box input");


    if (searchInput) {

        searchInput.addEventListener(
            "input",
            () => {

                const search =
                    searchInput.value
                        .toLowerCase()
                        .trim();

                const searchableElements =
                    document.querySelectorAll(
                        ".card, .postcard, .skill, .medal"
                    );


                searchableElements.forEach(element => {

                    const text =
                        element.textContent
                            .toLowerCase();

                    if (
                        search === "" ||
                        text.includes(search)
                    ) {

                        element.style.display = "";

                    } else {

                        element.style.display = "none";

                    }

                });

            }
        );

    }


    /* ========================================================
       ACTION BUTTONS
    ======================================================== */

    const actionButtons =
        document.querySelectorAll(
            ".action-grid button"
        );


    actionButtons.forEach(button => {

        button.addEventListener(
            "click",
            () => {

                const action =
                    button.getAttribute("data-action");

                if (!action) return;


                switch (action) {

                    case "profile":
                        window.location.href =
                            "profile.html";
                        break;

                    case "worklog":
                        window.location.href =
                            "worklog.html";
                        break;

                    case "applications":
                        window.location.href =
                            "application-status.html";
                        break;

                    case "internships":
                        window.location.href =
                            "internships.html";
                        break;

                    default:
                        console.log(
                            "Action:",
                            action
                        );

                }

            }
        );

    });


    /* ========================================================
       RECOMMENDED INTERNSHIP BUTTONS
    ======================================================== */

    const internshipButtons =
        document.querySelectorAll(
            ".postcard .btn"
        );


    internshipButtons.forEach(button => {

        button.addEventListener(
            "click",
            () => {

                const company =
                    button
                        .closest(".postcard")
                        ?.querySelector("h3");

                if (company) {

                    alert(
                        `Opening internship details for ${company.textContent.trim()}`
                    );

                }

            }
        );

    });


    /* ========================================================
       GROWTH VINE / PROFILE COMPLETION
    ======================================================== */

    const vinePath =
        document.querySelector(".vine-path");

    const leaves =
        document.querySelectorAll(".leaf");


    if (vinePath) {

        try {

            const pathLength =
                vinePath.getTotalLength();

            const percent =
                parseFloat(
                    vinePath.getAttribute("data-percent")
                ) || 0;


            vinePath.style.strokeDasharray =
                pathLength;

            vinePath.style.strokeDashoffset =
                pathLength;


            function animateVine() {

                requestAnimationFrame(() => {

                    vinePath.style.strokeDashoffset =
                        pathLength -
                        (pathLength * percent / 100);

                });


                leaves.forEach(leaf => {

                    const threshold =
                        parseFloat(
                            leaf.getAttribute(
                                "data-threshold"
                            )
                        ) || 0;


                    if (threshold <= percent) {

                        setTimeout(() => {

                            leaf.classList.add("lit");

                        }, 300 + threshold * 5);

                    }

                });

            }


            if ("IntersectionObserver" in window) {

                const vineObserver =
                    new IntersectionObserver(
                        entries => {

                            entries.forEach(entry => {

                                if (
                                    entry.isIntersecting
                                ) {

                                    animateVine();

                                    vineObserver.unobserve(
                                        entry.target
                                    );

                                }

                            });

                        },
                        {
                            threshold: 0.3
                        }
                    );


                vineObserver.observe(vinePath);

            } else {

                animateVine();

            }

        } catch (error) {

            console.log(
                "Growth animation unavailable."
            );

        }

    }


    /* ========================================================
       PROFILE COMPLETION MESSAGE
    ======================================================== */

    const completionValue =
        document.querySelector(
            "[data-completion]"
        );


    if (completionValue) {

        const percent =
            parseInt(
                completionValue.getAttribute(
                    "data-completion"
                ),
                10
            ) || 0;


        let message = "";


        if (percent >= 90) {

            message =
                "Excellent! Your profile is almost complete.";

        } else if (percent >= 75) {

            message =
                "Great progress! Keep growing your profile.";

        } else if (percent >= 50) {

            message =
                "You're halfway there. Keep going!";

        } else {

            message =
                "Every small step builds your career.";

        }


        const messageElement =
            document.querySelector(
                ".completion-message"
            );


        if (messageElement) {
            messageElement.textContent =
                message;
        }

    }


    /* ========================================================
       MOTIVATIONAL MESSAGE
    ======================================================== */

    const motivationText =
        document.querySelector(
            "[data-motivation]"
        );


    if (motivationText) {

        const messages = [

            "Small progress every day creates extraordinary results.",

            "Your internship is not just experience — it is your first step toward your career.",

            "Keep learning. Keep building. Keep growing.",

            "The skills you build today become the opportunities you get tomorrow.",

            "Consistency turns students into professionals."

        ];


        const randomMessage =
            messages[
                Math.floor(
                    Math.random() *
                    messages.length
                )
            ];


        motivationText.textContent =
            randomMessage;

    }


    /* ========================================================
       CURRENT DATE
    ======================================================== */

    const dateElements =
        document.querySelectorAll(
            "[data-current-date]"
        );


    if (dateElements.length > 0) {

        const today =
            new Date();


        const formattedDate =
            today.toLocaleDateString(
                "en-IN",
                {
                    day: "2-digit",
                    month: "short",
                    year: "numeric"
                }
            );


        dateElements.forEach(element => {

            element.textContent =
                formattedDate;

        });

    }


    /* ========================================================
       SMOOTH SCROLL
    ======================================================== */

    document
        .querySelectorAll('a[href^="#"]')
        .forEach(link => {

            link.addEventListener(
                "click",
                event => {

                    const targetId =
                        link.getAttribute("href");

                    if (
                        targetId === "#" ||
                        !targetId
                    ) {
                        return;
                    }


                    const target =
                        document.querySelector(
                            targetId
                        );


                    if (target) {

                        event.preventDefault();

                        target.scrollIntoView({
                            behavior: "smooth",
                            block: "start"
                        });

                    }

                }
            );

        });


    /* ========================================================
       WINDOW RESIZE
    ======================================================== */

    window.addEventListener(
        "resize",
        () => {

            if (
                window.innerWidth > 760
            ) {

                closeSidebar();

            }

        }
    );


    /* ========================================================
       PAGE READY
    ======================================================== */

    document.body.classList.add(
        "dashboard-ready"
    );

});