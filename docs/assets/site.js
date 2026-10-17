/* ==========================================================================
   INSEAD TOM PhD — the view layer.

   Three tiers, in order:
     1. DERIVE  — turns records into facts (programme year, next milestone,
                  what is overdue). Nothing here draws anything.
     2. RENDER  — turns those facts into markup.
     3. BOOT    — each page names the renderers it wants via window.PAGE.
   ========================================================================== */

(function () {
  "use strict";

  /* ======================================================================
     1. DERIVE
     ====================================================================== */

  var D = {};

  function periodIndex(key) {
    var ps = window.PROGRAM.periods;
    for (var i = 0; i < ps.length; i++) if (ps[i].key === key) return i;
    return -1;
  }
  function monthToAY(y, m) { return m >= 9 ? y : y - 1; }

  /* Date string -> position on a continuous academic-year axis. Used only to
     work out which programme year something falls in; nothing is plotted
     continuously any more. */
  D.pos = function (when) {
    if (!when) return null;
    var m = /^(\d{4})-P(\d)$/i.exec(when);
    if (m) {
      var pi = periodIndex("P" + m[2]);
      return pi < 0 ? null : (+m[1]) + (pi + 1) / window.PROGRAM.periods.length;
    }
    m = /^(\d{4})-(\d{1,2})$/.exec(when);
    if (m) {
      var y = +m[1], mo = +m[2];
      var idx = (mo - 9 + 12) % 12;
      return monthToAY(y, mo) + Math.min(idx / 10, 1);
    }
    return null;
  };

  var MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  D.label = function (when) {
    if (!when) return "";
    var m = /^(\d{4})-P(\d)$/i.exec(when);
    if (m) return "P" + m[2] + " " + m[1] + "–" + String((+m[1]) + 1).slice(2);
    m = /^(\d{4})-(\d{1,2})$/.exec(when);
    if (m) return MONTHS[(+m[2]) - 1] + " " + m[1];
    return when;
  };

  /* "Jun 24" — for the tight cells of the cohort grid. */
  D.shortLabel = function (when) {
    if (!when) return "";
    var m = /^(\d{4})-(\d{1,2})$/.exec(when);
    if (m) return MONTHS[(+m[2]) - 1] + " " + m[1].slice(2);
    m = /^(\d{4})-P(\d)$/i.exec(when);
    if (m) return "P" + m[2] + " " + m[1].slice(2);
    return when;
  };

  D.currentAY = function () {
    var d = new Date();
    return d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
  };

  D.now = function () {
    var d = new Date();
    var y = d.getFullYear(), m = d.getMonth() + 1;
    var idx = (m - 9 + 12) % 12;
    return monthToAY(y, m) + Math.min(idx / 10, 1);
  };

  /* Where a milestone is expected, in programme-year space. */
  D.duePos = function (ms) {
    if (!ms.due) return null;
    var pi = periodIndex(ms.due.period);
    if (pi < 0) return null;
    return (ms.due.year - 1) + (pi + 1) / window.PROGRAM.periods.length;
  };

  D.elapsed = function (s) { return D.now() - s.cohort; };
  D.year = function (s) { return Math.floor(D.elapsed(s)) + 1; };

  /* Which programme year a position falls in, 1-based.

     Two rounding rules, and they genuinely differ. An actual date is a point
     in time: September sits at x.0, the first day of the next programme
     year, so it rounds up. A `due` is a deadline expressed as the END of a
     period, so "end of Year 2" is also x.0 but belongs to the year that has
     just closed, and rounds down. */
  function yearOfDate(p) { return Math.floor(p) + 1; }
  function yearOfDue(p)  { return Math.floor(p - 1e-6) + 1; }

  /* The fixed sitting for a cohort-wide milestone, if one is on the books. */
  D.sitting = function (s, ms) {
    var sched = (window.PROGRAM.schedule || {})[ms.key];
    return (sched && sched[s.cohort]) || null;
  };

  /* Every milestone for a student, annotated. The one function views use. */
  D.progress = function (s) {
    var elapsed = D.elapsed(s);
    var done = s.done || {};
    var planned = s.planned || {};
    var seenNext = false;

    return window.PROGRAM.milestones.map(function (ms) {
      var when = done[ms.key] || null;

      /* What is on the books but has not happened: an explicit plan on the
         student, or — for cohort-wide milestones — the scheduled sitting. */
      var plan = when ? null : (planned[ms.key] || (ms.kind === "cohort" ? D.sitting(s, ms) : null));

      var due = D.duePos(ms);

      var year = null;
      if (when)      year = yearOfDate(D.pos(when) - s.cohort);
      else if (plan) year = yearOfDate(D.pos(plan) - s.cohort);
      else if (due !== null) year = yearOfDue(due);

      var state;
      if (when) { state = "done"; }
      else if (!seenNext) { seenNext = true; state = "next"; }
      else { state = "todo"; }

      return {
        key: ms.key,
        label: ms.label,
        abbr: ms.abbr || ms.label,
        kind: ms.kind,
        when: when,
        whenLabel: D.label(when),
        plan: plan,
        planLabel: D.label(plan),
        date: when || plan || null,
        dateLabel: D.label(when || plan),
        shortDate: D.shortLabel(when || plan),
        year: year,
        due: due,
        state: state,
        overdue: !when && due !== null && elapsed >= due
      };
    });
  };

  D.next = function (s) {
    var n = D.progress(s).filter(function (m) { return m.state === "next"; });
    return n.length ? n[0] : null;
  };

  D.overdue = function (s) {
    return D.progress(s).filter(function (m) { return m.overdue; });
  };

  D.dueThisYear = function (s) {
    var elapsed = D.elapsed(s);
    return D.progress(s).filter(function (m) {
      return !m.when && m.due !== null && m.due > elapsed && m.due <= elapsed + 1;
    });
  };

  D.activeStudents = function () {
    return (window.STUDENTS || []).filter(function (s) {
      return !s.status || s.status === "active" || s.status === "leave";
    });
  };

  /* --- courses --- */

  D.allCourses = function () {
    return (window.COURSES || []).concat(window.SCHOOL_COURSES || []);
  };
  D.offering = function (c, ay) {
    var o = (c.offerings || []).filter(function (x) { return x.ay === ay; });
    return o.length ? o[0] : null;
  };
  D.nextOffering = function (c, ay) {
    var f = (c.offerings || []).filter(function (x) { return x.ay >= ay; })
      .sort(function (a, b) { return a.ay - b.ay; });
    return f.length ? f[0] : null;
  };

  window.DERIVE = D;

  /* ======================================================================
     2. RENDER
     ====================================================================== */

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function link(href, text, cls) {
    if (!href) return esc(text);
    return '<a' + (cls ? ' class="' + cls + '"' : '') + ' href="' + esc(href) + '">' + esc(text) + "</a>";
  }
  var ORD = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];
  function ordinal(n) { return ORD[n] || (n + "th"); }
  function ayLabel(ay) { return ay + "–" + String(ay + 1).slice(2); }
  function slug(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }
  function facultyHref(name) {
    var f = (window.FACULTY || []).filter(function (x) { return x.name === name; })[0];
    return f && f.url ? f.url : "";
  }
  function nameList(names) {
    return (names || []).map(function (n) { return link(facultyHref(n), n); }).join(", ");
  }

  /* ---------- cohort flow ----------
     One shared timeline. Because the qualifying exam and the second-year paper
     are sat by the whole cohort at the same point, they belong to the axis and
     not to any student — so they are drawn as gates everyone passes through,
     each landing on a year boundary. Students sit in the year they are
     currently in. The individually-scheduled milestones live on the cards. */

  function initials(name) {
    var parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    var a = parts[0][0];
    var b = parts.length > 1 ? parts[parts.length - 1][0] : "";
    return (a + b).toUpperCase();
  }

  function avatar(s) {
    return s.photo
      ? '<img class="av" src="' + esc(s.photo) + '" alt="" ' +
        'onerror="this.outerHTML=\'<span class=&quot;av mono&quot;>' + esc(initials(s.name)) + '</span>\'">'
      : '<span class="av mono">' + esc(initials(s.name)) + "</span>";
  }

  function renderFlow(id) {
    var host = document.getElementById(id);
    if (!host || !window.STUDENTS) return;
    if (!D.activeStudents().length) { host.innerHTML = EMPTY; return; }

    var N = window.PROGRAM.displayYears || window.PROGRAM.nominalYears;
    var pct = function (v) { return Math.max(0, Math.min(100, (v / N) * 100)); };

    /* Gates: the cohort-wide milestones, at their fixed programme position.
       Both fall on a year boundary, so each lands on a column divider and the
       line can run the full height of the chart. */
    var gates = window.PROGRAM.milestones
      .filter(function (m) { return m.kind === "cohort"; })
      .map(function (m) { return { m: m, at: D.duePos(m) }; })
      .filter(function (g) { return g.at !== null; })
      .sort(function (a, b) { return a.at - b.at; });

    /* Which milestone rings a portrait. */
    var hiKey = window.PROGRAM.flowHighlight;
    var hiMs = window.PROGRAM.milestones.filter(function (m) { return m.key === hiKey; })[0];

    var byYear = {};
    D.activeStudents().forEach(function (s) {
      var y = Math.min(Math.max(D.year(s), 1), N);
      (byYear[y] = byYear[y] || []).push(s);
    });

    var scale = "";
    for (var y = 1; y <= N; y++) scale += '<span class="fy">Year ' + y + "</span>";

    var lines = gates.map(function (g) {
      return '<span class="gate" style="left:' + pct(g.at) + '%"></span>';
    }).join("");

    var feet = gates.map(function (g) {
      return '<span class="gate-l" style="left:' + pct(g.at) + '%">' + esc(g.m.label) + "</span>";
    }).join("");

    var cols = "";
    for (var c = 1; c <= N; c++) {
      var here = byYear[c] || [];
      cols += '<div class="fcol">' + (here.length
        ? here.map(function (s) {
            var hit = hiKey && (s.done || {})[hiKey];
            return '<a class="fp' + (hit ? " hi" : "") + '" href="#' + esc(s.id) + '" ' +
                'title="' + esc(s.name + " — entered " + s.cohort) + '">' +
                avatar(s) +
                '<span class="fp-n">' + esc(s.name) + "</span>" +
              "</a>";
          }).join("")
        : '<span class="fcol-none">—</span>') + "</div>";
    }

    var label = hiMs ? hiMs.label.toLowerCase() : "milestone";
    var done = D.activeStudents().filter(function (s) { return (s.done || {})[hiKey]; }).length;

    host.innerHTML =
      '<div class="flow" style="--cols:' + N + '">' +
        '<div class="flow-scale">' + scale + "</div>" +
        '<div class="flow-body">' +
          '<div class="flow-cols">' + cols + "</div>" +
          lines +
        "</div>" +
        '<div class="flow-feet">' + feet + "</div>" +
      "</div>" +
      '<ul class="key">' +
        '<li><span class="swatch av-hi"></span>' + esc(label) + " defended</li>" +
        '<li><span class="swatch av-no"></span>not yet</li>' +
      "</ul>" +
      '<p class="note"><span>Portraits are ringed once the ' + esc(label) +
        " is recorded as passed — " + done + " of " + D.activeStudents().length +
        " so far. The " + esc(label) + " and the defence are arranged individually, " +
        "so their dates live on the cards below rather than on the axis.</span></p>";
  }

  /* ---------- student cards ---------- */

  function paperLine(p) {
    var who = (p.coauthors || []).length ? "with " + p.coauthors.join(", ") : "solo-authored";
    var bits = [p.venue ? "<em>" + esc(p.venue) + "</em>" : "", p.year ? esc(p.year) : ""].filter(Boolean).join(", ");
    return "<li>" +
      '<span class="t">' + link(p.url, p.title) + (p.jmp ? ' <span class="status">JMP</span>' : "") + "</span>" +
      '<span class="a">' + esc(who) + "</span>" +
      '<span class="v">' + bits + (p.status ? ' <span class="cite">' + esc(p.status) + "</span>" : "") + "</span>" +
    "</li>";
  }

  function card(s) {
    var prog = D.progress(s);
    var nx = D.next(s);
    var late = D.overdue(s);

    var steps = prog.map(function (m) {
      var cls = m.state + (m.overdue ? " late" : "");
      var date = m.when
        ? '<span class="when">' + esc(m.whenLabel) + "</span>"
        : (m.plan ? '<span class="when plan">' + esc(m.planLabel) + "</span>" : "");
      return '<li class="step ' + cls + '">' +
        '<span class="lbl">' + esc(m.label) + "</span>" + date +
        (m.overdue ? '<span class="when late">overdue</span>' : "") +
      "</li>";
    }).join("");

    var rows = [];
    rows.push(["Advisor" + ((s.advisors || []).length === 1 ? "" : "s"),
      (s.advisors || []).length ? nameList(s.advisors) : '<span class="muted">not yet assigned</span>']);
    if ((s.committee || []).length) rows.push(["Committee", nameList(s.committee)]);
    rows.push(["Next", nx
      ? esc(nx.label) + (nx.dateLabel ? ' <span class="muted">· ' + esc(nx.dateLabel) + "</span>" : "")
      : "Complete"]);
    if (s.teaching && s.teaching.length) rows.push(["Teaching", esc(s.teaching.join("; "))]);
    if (s.email) rows.push(["Email", link("mailto:" + s.email, s.email)]);

    return '<article class="card' + (late.length ? " flagged" : "") + '" id="' + esc(s.id) + '">' +
      '<div class="card-head">' +
        '<span class="name">' + link(s.url, s.name) + "</span>" +
        '<span class="card-tags">' +
          '<span class="status quiet">' + ordinal(D.year(s)) + " year · " + s.cohort + "</span>" +
          (s.status && s.status !== "active" ? '<span class="status quiet">' + esc(s.status) + "</span>" : "") +
          (late.length ? '<span class="status warn">' + late.length + " overdue</span>" : "") +
        "</span>" +
      "</div>" +
      (s.topic ? '<p class="topic">' + esc(s.topic) + "</p>" : "") +
      '<dl class="facts">' + rows.map(function (r) { return "<dt>" + r[0] + "</dt><dd>" + r[1] + "</dd>"; }).join("") + "</dl>" +
      '<div class="track-wrap"><ol class="track">' + steps + "</ol></div>" +
      ((s.papers || []).length
        ? '<p class="subhead">Papers</p><ul class="list compact">' + s.papers.map(paperLine).join("") + "</ul>" : "") +
      (s.note ? '<p class="note"><span>' + esc(s.note) + "</span></p>" : "") +
    "</article>";
  }

  function renderCards(id) {
    var host = document.getElementById(id);
    if (!host || !window.STUDENTS) return;
    if (!D.activeStudents().length) { host.innerHTML = ""; return; }

    var byCohort = {};
    D.activeStudents().forEach(function (s) { (byCohort[s.cohort] = byCohort[s.cohort] || []).push(s); });
    var years = Object.keys(byCohort).map(Number).sort(function (a, b) { return a - b; });

    host.innerHTML = years.map(function (yr) {
      var nth = D.currentAY() - yr + 1;
      return '<section class="section"><h2>' + esc(nth > 0 ? ordinal(nth) + " year" : "Incoming") +
        '<span class="sub">entered ' + yr + '</span></h2><div class="body"><div class="cards">' +
        byCohort[yr].map(card).join("") + "</div></div></section>";
    }).join("");
  }

  /* ---------- course calendar ---------- */

  function courseChip(c) {
    return '<a class="chip' + (c.owner === "TOM" ? " own" : "") + '" href="#' + esc(c.id) + '">' +
      '<span class="chip-t">' + esc(c.title) + "</span>" +
      '<span class="chip-m">' + esc(c.owner === "TOM" ? (c.code || "TOM") : c.owner) +
        ((c.targetYears || []).length ? " · Y" + c.targetYears.join("/") : "") + "</span>" +
    "</a>";
  }

  function renderCalendar(id) {
    var host = document.getElementById(id);
    if (!host || !window.PROGRAM) return;
    var ay = D.currentAY(), all = D.allCourses();

    var cols = window.PROGRAM.periods.map(function (p) {
      var here = all.filter(function (c) {
        var o = D.offering(c, ay); return o && o.period === p.key;
      });
      return '<div class="cal-col">' +
        '<div class="cal-head"><span class="cal-p">' + esc(p.key) + "</span>" +
        '<span class="cal-m">' + esc(p.months) + "</span></div>" +
        (here.length ? here.map(courseChip).join("") : '<p class="cal-none">—</p>') +
      "</div>";
    }).join("");

    var allYear = all.filter(function (c) {
      var o = D.offering(c, ay); return o && o.period === "all";
    });

    var hasOther = all.some(function (c) { return c.owner !== "TOM"; });

    host.innerHTML = '<div class="cal">' + cols + "</div>" +
      (allYear.length ? '<div class="cal-band">' + allYear.map(function (c) {
        return '<a class="chip own" href="#' + esc(c.id) + '">' +
          '<span class="chip-t">' + esc(c.title) + "</span>" +
          '<span class="chip-m">runs all year</span>' +
        "</a>";
      }).join("") + "</div>" : "") +
      (hasOther
        ? '<ul class="key"><li><span class="swatch chip-own"></span>TOM area</li>' +
          '<li><span class="swatch chip-other"></span>elsewhere at INSEAD</li></ul>'
        : "");
  }

  function renderCourseStats(id) {
    var host = document.getElementById(id);
    if (!host) return;
    var ay = D.currentAY();
    var all = D.allCourses();
    if (!all.length) { host.innerHTML = ""; return; }

    var thisYear = all.filter(function (c) { return D.offering(c, ay); });
    var missing  = all.filter(function (c) { return !c.outline; });
    var unsched  = all.filter(function (c) { return !D.nextOffering(c, ay); });

    var groups = [
      { label: "Running in " + ayLabel(ay), n: thisYear.length, items: [] },
      { label: "Outlines on file", n: (all.length - missing.length) + " / " + all.length,
        items: missing.map(function (c) { return c.title; }),
        tone: missing.length ? "warn" : "" },
      { label: "Not on the schedule", n: unsched.length,
        items: unsched.map(function (c) { return c.title; }),
        tone: unsched.length ? "warn" : "" }
    ];

    host.innerHTML = '<div class="alerts">' + groups.map(function (g) {
      var shown = g.items.slice(0, 5), rest = g.items.length - shown.length;
      return '<div class="alert' + (g.tone ? " " + g.tone : "") + '">' +
        '<span class="alert-n">' + esc(g.n) + "</span>" +
        '<span class="alert-l">' + esc(g.label) + "</span>" +
        (shown.length ? "<ul>" + shown.map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("") +
          (rest > 0 ? '<li class="muted">and ' + rest + " more</li>" : "") + "</ul>" : "") +
      "</div>";
    }).join("") + "</div>";
  }

  function renderCourses(id) {
    var host = document.getElementById(id);
    if (!host) return;
    var ay = D.currentAY();
    var groups = [];
    D.allCourses().forEach(function (c) {
      var g = c.owner === "TOM" ? "TOM area" : "Elsewhere at INSEAD";
      var hit = groups.filter(function (x) { return x.name === g; })[0];
      if (!hit) groups.push(hit = { name: g, items: [] });
      hit.items.push(c);
    });

    host.innerHTML = groups.map(function (g) {
      var items = g.items.map(function (c) {
        var here = D.offering(c, ay), next = D.nextOffering(c, ay);
        var when = here
          ? '<span class="status">' + (here.period === "all" ? "All year" : esc(here.period)) + " · " + ayLabel(ay) + "</span>"
          : (next ? '<span class="status quiet">Next: ' + esc(next.period) + " · " + ayLabel(next.ay) + "</span>"
                  : '<span class="status quiet">Not scheduled</span>');
        var meta = [
          c.code || null,
          c.owner !== "TOM" ? c.owner : null,
          (c.targetYears || []).length ? "Year " + c.targetYears.join("/") : null,
          c.sessions ? c.sessions + " sessions" : null,
          c.required ? "required" : null
        ].filter(Boolean).map(esc).join(" · ");
        var who = (here && here.instructors) || c.instructors || [];

        return '<li id="' + esc(c.id) + '">' +
          '<span class="t">' + esc(c.title) + " " + when + "</span>" +
          (who.length ? '<span class="a">' + nameList(who) + "</span>" : "") +
          '<span class="v"><span class="cite">' + meta + "</span>" +
            (c.outline ? '<a class="code" href="' + esc(c.outline) + '">Outline</a>'
                       : ' <span class="code muted">no outline on file</span>') + "</span>" +
          (c.description ? '<p class="note"><span>' + esc(c.description) + "</span></p>" : "") +
          ((c.topics || []).length
            ? '<span class="v"><span class="cite">Reading list:</span> ' + c.topics.map(function (t) {
                return '<a href="reading.html#topic-' + slug(t) + '">' + esc(t) + "</a>";
              }).join(", ") + "</span>"
            : "") +
        "</li>";
      }).join("");

      return '<section class="section"><h2>' + esc(g.name) +
        '<span class="sub">' + g.items.length + " course" + (g.items.length === 1 ? "" : "s") +
        '</span></h2><div class="body"><ul class="list">' + items + "</ul></div></section>";
    }).join("");
  }

  /* ---------- reading lists, as tabs ---------- */

  var PDF_ROOT = "../PhD reading list/";

  function paperHref(p) {
    if (p.url) return p.url;
    if (p.doi) return "https://doi.org/" + p.doi;
    return "https://scholar.google.com/scholar?q=" + encodeURIComponent(p.t);
  }

  function readingLi(p, dir) {
    var cite = [p.v ? "<em>" + esc(p.v) + "</em>" : "", p.y ? esc(p.y) : ""].filter(Boolean).join(", ");
    var pdf = (p.pdf && dir)
      ? '<a class="code" href="' + esc(encodeURI(PDF_ROOT + dir + "/" + p.pdf)) + '">PDF</a>' : "";
    return "<li><span class=\"t\">" + link(paperHref(p), p.t) + "</span>" +
      '<span class="a">' + esc(p.a) + "</span>" +
      '<span class="v">' + cite + (p.c ? ' &nbsp;<span class="cite">' + esc(p.c) + "</span>" : "") + pdf + "</span>" +
      (p.note ? '<p class="note"><span>' + esc(p.note) + "</span></p>" : "") +
    "</li>";
  }

  function listBody(L) {
    var intro = '<section class="section"><h2>' + esc(L.title) + "</h2>" +
      '<div class="body">' +
        (L.blurb ? '<p class="lede">' + esc(L.blurb) + "</p>" : "") +
        (L.prepared ? "<p>" + esc(L.prepared) + "</p>" : "") +
      "</div></section>";

    if (L.topics) {
      return intro + L.topics.map(function (t, i) {
        return '<section class="section" id="topic-' + slug(t.name) + '"><h2>' + esc(t.name) +
          '<span class="sub">' + (i + 1) + " / " + L.topics.length + "</span></h2>" +
          '<div class="body"><ul class="list compact">' +
          t.papers.map(function (p) { return readingLi(p, t.dir); }).join("") + "</ul></div></section>";
      }).join("");
    }

    var papers = L.papers || [];
    return intro + '<section class="section"><h2>Papers<span class="sub">' + papers.length + "</span></h2>" +
      '<div class="body">' +
        (papers.length
          ? '<ul class="list compact">' + papers.map(function (p) { return readingLi(p, null); }).join("") + "</ul>"
          : "<p>Nothing on this list yet. Add papers to the <span class=\"status quiet\">" + esc(L.id) +
            "</span> entry in <span class=\"status quiet\">data/reading.js</span>.</p>") +
      "</div></section>";
  }

  function renderReading(tabsId, bodyId) {
    var tabs = document.getElementById(tabsId);
    var body = document.getElementById(bodyId);
    if (!tabs || !body || !window.READING) return;
    var lists = window.READING.lists;

    function show(id, push) {
      var L = lists.filter(function (x) { return x.id === id; })[0] || lists[0];
      body.innerHTML = listBody(L);
      Array.prototype.forEach.call(tabs.querySelectorAll("button"), function (b) {
        b.setAttribute("aria-selected", String(b.dataset.id === L.id));
      });
      if (push) { try { history.replaceState(null, "", "#" + L.id); } catch (e) {} }
    }

    tabs.innerHTML = lists.map(function (L) {
      var n = L.topics ? L.topics.reduce(function (a, t) { return a + t.papers.length; }, 0)
                       : (L.papers || []).length;
      return '<button type="button" role="tab" data-id="' + esc(L.id) + '" aria-selected="false">' +
        esc(L.short || L.title) + '<span class="tab-n">' + n + "</span></button>";
    }).join("");

    tabs.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (b) show(b.dataset.id, true);
    });

    /* Deep links: #seminal opens a tab; #topic-queuing opens whichever tab
       holds that topic and scrolls to it. */
    var hash = (location.hash || "").slice(1);
    if (hash.indexOf("topic-") === 0) {
      var owner = lists.filter(function (L) {
        return (L.topics || []).some(function (t) { return slug(t.name) === hash.slice(6); });
      })[0];
      show(owner ? owner.id : lists[0].id, false);
      var el = document.getElementById(hash);
      if (el) el.scrollIntoView();
    } else {
      show(hash || lists[0].id, false);
    }
  }

  /* ---------- the rest ---------- */

  function renderFaculty(id) {
    var host = document.getElementById(id);
    if (!host || !window.FACULTY) return;
    host.innerHTML = '<ul class="list compact">' + window.FACULTY.map(function (f) {
      return "<li><span class=\"t\">" + link(f.url, f.name) + "</span>" +
        '<span class="v">' + esc(f.interests || "") + "</span></li>";
    }).join("") + "</ul>";
  }

  function renderMilestoneDefs(id) {
    var host = document.getElementById(id);
    if (!host || !window.PROGRAM) return;
    host.innerHTML = '<div class="tbl-wrap"><table class="tbl">' +
      "<thead><tr><th>Milestone</th><th>Set by</th><th>Expected by</th><th>What it is</th></tr></thead><tbody>" +
      window.PROGRAM.milestones.map(function (m) {
        return "<tr><td>" + esc(m.label) + "</td>" +
          "<td>" + (m.kind === "cohort" ? "the cohort calendar" : "the student") + "</td>" +
          '<td class="num">' + (m.due ? "Year " + m.due.year + " · " + m.due.period : "—") + "</td>" +
          "<td>" + esc(m.blurb) + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }

  function renderPeriods(id) {
    var host = document.getElementById(id);
    if (!host || !window.PROGRAM) return;
    host.innerHTML = '<div class="tbl-wrap"><table class="tbl">' +
      "<thead><tr><th>Period</th><th>Months</th></tr></thead><tbody>" +
      window.PROGRAM.periods.map(function (p) {
        return "<tr><td>" + esc(p.key) + '</td><td class="num">' + esc(p.months) + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }

  function renderSnapshot(id) {
    var host = document.getElementById(id);
    if (!host || !window.STUDENTS) return;
    var ay = D.currentAY(), counts = {};
    D.activeStudents().forEach(function (s) { var n = D.year(s); counts[n] = (counts[n] || 0) + 1; });
    var years = Object.keys(counts).map(Number).sort(function (a, b) { return a - b; });
    host.innerHTML = '<div class="tbl-wrap"><table class="tbl">' +
      '<thead><tr><th>Year</th><th>Entered</th><th class="num">Students</th></tr></thead><tbody>' +
      years.map(function (n) {
        return "<tr><td>" + esc(ordinal(n) + " year") + '</td><td class="num">' + (ay - n + 1) +
          '</td><td class="num">' + counts[n] + "</td></tr>";
      }).join("") +
      '<tr><td>Total</td><td class="num"></td><td class="num">' + D.activeStudents().length + "</td></tr>" +
      "</tbody></table></div>";
  }

  /* ---------- alumni ----------
     Three views over one dataset: the record, where people are, and what the
     record adds up to. Anyone marked area "other" is kept in the data but
     shown in none of them. */

  function alumniTOM() {
    return (window.ALUMNI || []).filter(function (a) { return (a.area || "TOM") === "TOM"; });
  }

  /* One tooltip element, shared by the map and the charts. */
  var tipEl = null;
  function tooltip() {
    if (!tipEl) {
      tipEl = document.createElement("div");
      tipEl.className = "tip";
      tipEl.hidden = true;
      document.body.appendChild(tipEl);
    }
    return tipEl;
  }
  function bindTips(host) {
    var t = tooltip();
    host.addEventListener("mouseover", function (e) {
      var el = e.target.closest("[data-tip]");
      if (!el) return;
      t.innerHTML = el.getAttribute("data-tip");
      t.hidden = false;
    });
    host.addEventListener("mousemove", function (e) {
      if (t.hidden) return;
      var pad = 14;
      var x = Math.min(e.clientX + pad, window.innerWidth - t.offsetWidth - 8);
      var y = e.clientY + pad + t.offsetHeight > window.innerHeight
        ? e.clientY - t.offsetHeight - pad : e.clientY + pad;
      t.style.left = x + "px";
      t.style.top = Math.max(8, y) + "px";
    });
    host.addEventListener("mouseout", function (e) {
      if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest("[data-tip]")) t.hidden = true;
    });
  }

  /* ---- list ---- */

  function renderAlumniList(host, opts) {
    var ext = opts && opts.external;
    var all = window.ALUMNI || [];
    var A = alumniTOM();
    if (!A.length) {
      host.innerHTML = "<p>No entries yet. Alumni live in " +
        '<span class="status quiet">data/alumni.js</span>.</p>';
      return;
    }

    var sorted = A.slice().sort(function (a, b) {
      return b.graduated - a.graduated || String(a.name).localeCompare(String(b.name));
    });
    var hidden = all.length - A.length;
    var gap = function (f) {
      return A.filter(function (a) { return !a[f] || a[f].length === 0; }).length;
    };

    host.innerHTML =
      "<p>" + A.length + " graduates, " +
        Math.min.apply(null, A.map(function (a) { return a.graduated; })) + " to " +
        Math.max.apply(null, A.map(function (a) { return a.graduated; })) + "." +
        (hidden && !ext ? " " + hidden + " record" + (hidden === 1 ? "" : "s") +
          " from another area held in the data but not shown." : "") + "</p>" +
      '<div class="tbl-wrap"><table class="tbl">' +
        (ext ? "<thead><tr><th>Year</th><th>Name</th><th>Now</th></tr></thead><tbody>"
             : "<thead><tr><th>Year</th><th>Name</th><th>First placement</th><th>Now</th>" +
               '<th class="num">Cites</th><th>Links</th></tr></thead><tbody>') +
        sorted.map(function (a) {
          var links = [];
          if (a.url) links.push('<a class="code" href="' + esc(a.url) + '">Web</a>');
          if (a.scholarId) links.push('<a class="code" href="https://scholar.google.com/citations?user=' +
            esc(a.scholarId) + '">Scholar</a>');
          var now = "<td>" + (a.now ? esc(a.now) : '<span class="muted">—</span>') +
              (a.role ? '<span class="cite"> · ' + esc(a.role) + "</span>" : "") + "</td>";
          if (ext) return "<tr>" + '<td class="num">' + esc(a.graduated) + "</td><td>" + esc(a.name) + "</td>" + now + "</tr>";
          return "<tr>" +
            '<td class="num">' + esc(a.graduated) + "</td>" +
            "<td>" + esc(a.name) + (a.campus ? '<span class="cite"> · ' + esc(a.campus) + "</span>" : "") + "</td>" +
            "<td>" + (a.firstPlacement ? esc(a.firstPlacement) : '<span class="muted">—</span>') + "</td>" +
            "<td>" + (a.now ? esc(a.now) : '<span class="muted">—</span>') +
              (a.role ? '<span class="cite"> · ' + esc(a.role) + "</span>" : "") + "</td>" +
            '<td class="num">' + (a.citations == null ? '<span class="muted">—</span>' : esc(a.citations)) + "</td>" +
            "<td>" + (links.length ? links.join(" ") : '<span class="muted">—</span>') + "</td>" +
          "</tr>";
        }).join("") +
      "</tbody></table></div>" +
      (ext ? "" : '<p class="note"><span>Still to collect: first placement for ' + gap("firstPlacement") +
        ", advisors for " + gap("advisors") + ", thesis for " + gap("thesis") +
        ", website for " + gap("url") + ", Scholar id for " + gap("scholarId") +
        ", citations for " + gap("citations") +
        ". Citations and coordinates come from <strong>node refresh.js</strong>.</span></p>");
  }

  /* ---- map ---- */

  function renderAlumniMap(host, opts) {
    var ext = opts && opts.external;
    var W = window.WORLD;
    if (!W) { host.innerHTML = "<p>World outline not loaded.</p>"; return; }

    var A = alumniTOM().filter(function (a) { return a.place && a.place.lat != null; });
    var missing = alumniTOM().length - A.length;

    var px = function (lon) { return (lon + 180) / 360 * W.width; };
    var py = function (lat) { return (90 - lat) / 180 * W.height; };

    /* People at the same place become one circle, sized by how many. */
    var spots = {};
    A.forEach(function (a) {
      var k = a.place.lat.toFixed(2) + "," + a.place.lon.toFixed(2);
      (spots[k] = spots[k] || { lat: a.place.lat, lon: a.place.lon, who: [], place: a.place }).who.push(a);
    });
    var list = Object.keys(spots).map(function (k) { return spots[k]; });
    var most = list.reduce(function (m, s) { return Math.max(m, s.who.length); }, 1);

    var campuses = (window.PROGRAM.campuses || []).filter(function (c) {
      return A.some(function (a) { return a.campus === c.key; }) || c.key !== "ABD";
    });

    /* Arcs are drawn only where a campus is recorded; they light up as that
       field gets filled in. */
    var arcs = A.filter(function (a) { return a.campus; }).map(function (a) {
      var c = (window.PROGRAM.campuses || []).filter(function (x) { return x.key === a.campus; })[0];
      if (!c) return "";
      var x1 = px(c.lon), y1 = py(c.lat), x2 = px(a.place.lon), y2 = py(a.place.lat);
      var mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - Math.abs(x2 - x1) * 0.18;
      return '<path class="arc" d="M' + x1.toFixed(1) + " " + y1.toFixed(1) +
        " Q" + mx.toFixed(1) + " " + my.toFixed(1) + " " + x2.toFixed(1) + " " + y2.toFixed(1) + '"/>';
    }).join("");

    var dots = list.map(function (s) {
      var r = 3.2 + (s.who.length - 1) / Math.max(1, most - 1) * 3.4;
      var names = s.who.map(function (a) { return esc(a.name) + " <span>" + a.graduated + "</span>"; }).join("<br>");
      var label = esc([s.place.city, s.place.country].filter(Boolean).join(", "));
      return '<circle class="spot" cx="' + px(s.lon).toFixed(1) + '" cy="' + py(s.lat).toFixed(1) +
        '" r="' + r.toFixed(1) + '" data-tip="<strong>' + label + "</strong><br>" + names + '"/>';
    }).join("");

    var homes = campuses.map(function (c) {
      return '<g class="home" data-tip="<strong>INSEAD ' + esc(c.name) + "</strong>" +
          (window.PROGRAM.campuses ? "" : "") + '">' +
        '<circle cx="' + px(c.lon).toFixed(1) + '" cy="' + py(c.lat).toFixed(1) + '" r="4.5"/>' +
        '<circle class="ring" cx="' + px(c.lon).toFixed(1) + '" cy="' + py(c.lat).toFixed(1) + '" r="8"/>' +
      "</g>";
    }).join("");

    host.innerHTML = (ext ? alumniSummary() : "") +
      '<div class="mapzoom"><button type="button" data-z="in" aria-label="Zoom in">+</button>' +
        '<button type="button" data-z="out" aria-label="Zoom out">−</button>' +
        '<button type="button" data-z="reset">Reset</button></div>' +
      '<div class="mapwrap"><svg class="worldmap" viewBox="0 0 ' + W.width + " " + W.height +
        '" role="img" aria-label="Where alumni are now">' +
        '<path class="land" d="' + W.path + '"/>' +
        arcs + dots + homes +
      "</svg></div>" +
      '<ul class="key">' +
        '<li><span class="swatch spot-k"></span>alumni, sized by how many share a place</li>' +
        '<li><span class="swatch home-k"></span>INSEAD campus</li>' +
      "</ul>" +
      (ext ? "" : "<p class=\"note\"><span>" + list.length + " locations, " + A.length + " graduates." +
        (missing ? " " + missing + " without coordinates — run <strong>node refresh.js --geo</strong>." : "") +
        " Arcs from campus to current post appear once <strong>campus</strong> is recorded" +
        " (FBL or SGP); none of the records carry it yet.</span></p>");

    bindTips(host);
    mapZoom(host, W.width, W.height);
  }

  /* Zoom and pan the map by moving the SVG viewBox. Dots, rings and arcs
     keep their on-screen size: their radius and stroke shrink as you zoom. */
  function mapZoom(host, w0, h0) {
    var svg = host.querySelector("svg.worldmap"), wrap = host.querySelector(".mapwrap");
    var v = { x: 0, y: 0, w: w0, h: h0 };
    var marks = Array.prototype.map.call(svg.querySelectorAll("circle"), function (c) {
      return { el: c, r: +c.getAttribute("r") };
    });
    var lines = svg.querySelectorAll(".arc, .land, .home circle");
    function apply() {
      var k = w0 / v.w;
      svg.setAttribute("viewBox", [v.x, v.y, v.w, v.h].map(function (n) { return n.toFixed(2); }).join(" "));
      marks.forEach(function (m) { m.el.setAttribute("r", (m.r / Math.sqrt(k)).toFixed(2)); });
      Array.prototype.forEach.call(lines, function (l) { l.style.strokeWidth = ""; l.setAttribute("vector-effect", "non-scaling-stroke"); });
    }
    function clamp() {
      v.w = Math.min(w0, Math.max(w0 / 12, v.w)); v.h = v.w * h0 / w0;
      v.x = Math.min(w0 - v.w, Math.max(0, v.x)); v.y = Math.min(h0 - v.h, Math.max(0, v.y));
    }
    function zoom(f, fx, fy) {          // fx, fy: focus as a fraction of the view
      var nw = v.w / f, nh = nw * h0 / w0;
      v.x += (v.w - nw) * fx; v.y += (v.h - nh) * fy; v.w = nw; v.h = nh;
      clamp(); apply();
    }
    host.querySelector(".mapzoom").addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      if (b.dataset.z === "reset") { v = { x: 0, y: 0, w: w0, h: h0 }; apply(); }
      else zoom(b.dataset.z === "in" ? 1.6 : 1 / 1.6, 0.5, 0.5);
    });
    wrap.addEventListener("wheel", function (e) {
      e.preventDefault();
      var r = svg.getBoundingClientRect();
      zoom(Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0018)), (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    }, { passive: false });
    var drag = null;
    wrap.addEventListener("pointerdown", function (e) { drag = { x: e.clientX, y: e.clientY, vx: v.x, vy: v.y }; });
    window.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var r = svg.getBoundingClientRect(), s = v.w / r.width;
      v.x = drag.vx - (e.clientX - drag.x) * s; v.y = drag.vy - (e.clientY - drag.y) * s;
      clamp(); apply();
    });
    window.addEventListener("pointerup", function () { drag = null; });
    wrap.addEventListener("dblclick", function (e) {
      var r = svg.getBoundingClientRect();
      zoom(2, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    });
  }

  /* ---- stats ---- */

  function bars(rows, opts) {
    opts = opts || {};
    var max = rows.reduce(function (m, r) { return Math.max(m, r.value); }, 0) || 1;
    return '<div class="hbars">' + rows.map(function (r) {
      return '<div class="hbar" data-tip="' + esc(r.label) + ": <strong>" + esc(r.value) + "</strong>" +
          (r.note ? "<br>" + esc(r.note) : "") + '">' +
        '<span class="hbar-l">' + esc(r.label) + "</span>" +
        '<span class="hbar-t"><span class="hbar-f" style="width:' +
          (r.value / max * 100).toFixed(1) + '%"></span></span>' +
        '<span class="hbar-v">' + esc(opts.format ? opts.format(r.value) : r.value) + "</span>" +
      "</div>";
    }).join("") + "</div>";
  }

  /* ---- citations against career age ----
     Citations are heavily right-skewed — here the mean is 1,266 and the
     geometric mean 294 — so two things follow. The y axis is logarithmic, or
     nine tenths of the field collapses onto the baseline. And the trend is
     fitted to log(citations), so it tracks a typical graduate instead of being
     dragged upward by the most-cited one. */

  /* Local linear regression, tricube weights — a LOESS smoother. */
  function loess(pts, span) {
    var n = pts.length;
    var q = Math.max(2, Math.min(n, Math.floor(span * n)));
    var sortedGap = function (x0) {
      var d = pts.map(function (p) { return Math.abs(p.x - x0); }).sort(function (a, b) { return a - b; });
      return d[q - 1] || 1e-6;
    };
    return function (x0) {
      var dmax = sortedGap(x0);
      var sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
      pts.forEach(function (p) {
        var u = Math.abs(p.x - x0) / dmax;
        if (u >= 1) return;
        var t = 1 - u * u * u, w = t * t * t;
        sw += w; sx += w * p.x; sy += w * p.y;
        sxx += w * p.x * p.x; sxy += w * p.x * p.y;
      });
      if (sw === 0) return null;
      var mx = sx / sw, my = sy / sw;
      var vxx = sxx / sw - mx * mx, vxy = sxy / sw - mx * my;
      var b = Math.abs(vxx) < 1e-9 ? 0 : vxy / vxx;
      return my + b * (x0 - mx);
    };
  }

  function renderCitationCurve(host) {
    /* Academic year in progress: a 1996 graduate is 30 years on in 2026-27,
       and this year's graduate is at 0. */
    var thisAY = D.currentAY();
    var pts = alumniTOM()
      .filter(function (a) { return a.citations != null && a.graduated; })
      .map(function (a) {
        return { name: a.name, now: a.now, grad: a.graduated,
                 x: Math.max(0, thisAY - a.graduated), y: Math.max(1, a.citations) };
      });

    if (pts.length < 5) {
      host.innerHTML = '<div class="empty-state"><p>Not enough citation data yet to plot a trend.</p></div>';
      return;
    }

    var W = 1000, H = 420, L = 58, R = 104, T = 18, B = 40;
    var maxX = Math.ceil(Math.max.apply(null, pts.map(function (p) { return p.x; })) / 5) * 5;
    var maxY = Math.max.apply(null, pts.map(function (p) { return p.y; })) * 1.45;

    var sx = function (x) { return L + x / maxX * (W - L - R); };
    var sy = function (y) {
      var lo = 0, hi = Math.log10(maxY);
      return H - B - (Math.log10(Math.max(y, 1)) - lo) / (hi - lo) * (H - T - B);
    };

    /* gridlines: decades on y, five-year steps on x */
    var grid = "", yTicks = "", xTicks = "";
    for (var d = 0; Math.pow(10, d) <= maxY; d++) {
      var v = Math.pow(10, d), yy = sy(v).toFixed(1);
      grid += '<line class="g" x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '"/>';
      yTicks += '<text class="ax" x="' + (L - 9) + '" y="' + yy + '" text-anchor="end" dy="0.32em">' +
        (v >= 1000 ? (v / 1000) + "k" : v) + "</text>";
    }
    for (var t = 0; t <= maxX; t += 5) {
      var xx = sx(t).toFixed(1);
      xTicks += '<text class="ax" x="' + xx + '" y="' + (H - B + 20) + '" text-anchor="middle">' + t + "</text>";
    }

    /* the smoother, fitted in log space then brought back */
    var fit = loess(pts.map(function (p) { return { x: p.x, y: Math.log10(p.y) }; }), 0.62);
    var curve = [], STEPS = 70, last = null;
    for (var i = 0; i <= STEPS; i++) {
      var x0 = i / STEPS * maxX;
      var v2 = fit(x0);
      if (v2 == null) continue;
      last = { x: x0, y: Math.pow(10, v2) };
      curve.push((curve.length ? "L" : "M") + sx(x0).toFixed(1) + " " + sy(last.y).toFixed(1));
    }

    /* one anchor label so the chart still reads without a pointer */
    var top = pts.slice().sort(function (a, b) { return b.y - a.y; })[0];

    var dots = pts.map(function (p) {
      return '<circle class="pt" cx="' + sx(p.x).toFixed(1) + '" cy="' + sy(p.y).toFixed(1) + '" r="5" ' +
        'data-tip="<strong>' + esc(p.name) + "</strong><br>" + p.y.toLocaleString() +
        " citations<br><span>PhD " + p.grad + " · " + p.x + " year" + (p.x === 1 ? "" : "s") +
        ' on</span>"/>';
    }).join("");

    host.innerHTML =
      '<div class="chartwrap"><svg class="chart" viewBox="0 0 ' + W + " " + H + '" ' +
        'role="img" aria-label="Citations against years since the PhD, log scale">' +
        grid +
        '<line class="axis" x1="' + L + '" x2="' + L + '" y1="' + T + '" y2="' + (H - B) + '"/>' +
        '<line class="axis" x1="' + L + '" x2="' + (W - R) + '" y1="' + (H - B) + '" y2="' + (H - B) + '"/>' +
        yTicks + xTicks +
        '<text class="axl" x="' + L + '" y="' + (T - 4) + '">citations</text>' +
        '<text class="axl" x="' + ((L + W - R) / 2) + '" y="' + (H - 4) + '" text-anchor="middle">' +
          "years since the PhD</text>" +
        '<path class="trend" d="' + curve.join("") + '"/>' +
        (last ? '<text class="trendl" x="' + (sx(last.x) + 9).toFixed(1) + '" y="' +
          sy(last.y).toFixed(1) + '" dy="0.32em">typical<tspan x="' + (sx(last.x) + 9).toFixed(1) +
          '" dy="1.15em">trajectory</tspan></text>' : "") +
        dots +
        '<text class="ptl" x="' + (sx(top.x) - 9).toFixed(1) + '" y="' + sy(top.y).toFixed(1) +
          '" text-anchor="end" dy="0.32em">' + esc(top.name) + "</text>" +
      "</svg></div>" +
      '<p class="note"><span>Each dot is a graduate; ' + pts.length + " of " + alumniTOM().length +
        " have citation counts. The axis is logarithmic — the field spans two to eleven thousand " +
        "citations, and a linear axis would flatten everyone below the top few. The curve is a " +
        "local regression through the log of each count, so it follows a typical graduate rather " +
        "than being pulled up by the most-cited.</span></p>";

    bindTips(host);
  }

  /* The four figures and the graduates-per-year chart. */
  function alumniSummary() {
    var A = alumniTOM();
    if (!A.length) return "";
    var years = A.map(function (a) { return a.graduated; });
    var y0 = Math.min.apply(null, years), y1 = Math.max.apply(null, years);
    var countries = {};
    A.forEach(function (a) { var c = (a.place && a.place.country) || ""; if (c) countries[c] = 1; });
    var nC = Object.keys(countries).length;
    /* Public builds ship only the total (window.ALUMNI_SUMMARY), never
       individual citation counts. */
    var cited = A.filter(function (a) { return a.citations != null; });
    var totalCites = cited.reduce(function (n, a) { return n + a.citations; }, 0);
    var nCited = cited.length;
    if (!nCited && window.ALUMNI_SUMMARY) { totalCites = window.ALUMNI_SUMMARY.citations; nCited = window.ALUMNI_SUMMARY.cited; }
    var tiles = [
      { n: A.length, l: "graduates" },
      { n: (y1 - y0 + 1), l: "years, " + y0 + "–" + y1 },
      { n: nC || "—", l: "countries" },
      { n: nCited ? totalCites.toLocaleString() : "—", l: "citations" +
          (nCited && nCited < A.length ? " (" + nCited + " of " + A.length + ")" : "") }
    ];
    var perYear = [];
    for (var y = y0; y <= y1; y++) perYear.push({ year: y, n: years.filter(function (v) { return v === y; }).length });
    var peak = perYear.reduce(function (m, r) { return Math.max(m, r.n); }, 1);
    return '<div class="tiles">' + tiles.map(function (t) {
        return '<div class="tile"><span class="tile-n">' + esc(t.n) + "</span>" +
          '<span class="tile-l">' + esc(t.l) + "</span></div>";
      }).join("") + "</div>" +
      '<p class="subhead">Graduates per year</p>' +
      '<div class="vbars">' + perYear.map(function (r) {
        return '<div class="vbar' + (r.n ? "" : " zero") + '" data-tip="<strong>' + r.year +
            "</strong><br>" + r.n + " graduate" + (r.n === 1 ? "" : "s") + '">' +
          '<span class="vbar-t"><span class="vbar-f" style="height:' + (r.n / peak * 100).toFixed(1) + '%"></span></span>' +
          '<span class="vbar-l">' + (r.year % 5 === 0 ? "&rsquo;" + String(r.year).slice(2) : "") + "</span>" +
        "</div>";
      }).join("") + "</div>";
  }

  function renderAlumniStats(host) {
    var A = alumniTOM();
    if (!A.length) { host.innerHTML = "<p>Nothing to summarise yet.</p>"; return; }

    var years = A.map(function (a) { return a.graduated; });
    var y0 = Math.min.apply(null, years), y1 = Math.max.apply(null, years);

    var countries = {};
    A.forEach(function (a) {
      var c = (a.place && a.place.country) || "";
      if (c) countries[c] = (countries[c] || 0) + 1;
    });
    var byCountry = Object.keys(countries).map(function (c) {
      return { label: c, value: countries[c] };
    }).sort(function (a, b) { return b.value - a.value || a.label.localeCompare(b.label); });

    var cited = A.filter(function (a) { return a.citations != null; });
    var totalCites = cited.reduce(function (n, a) { return n + a.citations; }, 0);

    var tiles = [
      { n: A.length, l: "graduates" },
      { n: (y1 - y0 + 1), l: "years, " + y0 + "–" + y1 },
      { n: byCountry.length || "—", l: "countries" },
      { n: cited.length ? totalCites.toLocaleString() : "—", l: "citations" +
          (cited.length && cited.length < A.length ? " (" + cited.length + " of " + A.length + ")" : "") }
    ];

    /* graduates per year, every year in range so gaps show */
    var perYear = [];
    for (var y = y0; y <= y1; y++) {
      perYear.push({ year: y, n: years.filter(function (v) { return v === y; }).length });
    }
    var peak = perYear.reduce(function (m, r) { return Math.max(m, r.n); }, 1);

    var citeBlock;
    if (cited.length) {
      var curveHost = null;
      var top = cited.slice().sort(function (a, b) { return b.citations - a.citations; }).slice(0, 12)
        .map(function (a) { return { label: a.name, value: a.citations, note: a.now }; });
      citeBlock = '<p class="subhead">Citations by career age</p><div id="citecurve"></div>' +
        '<p class="subhead">Most cited</p>' +
        bars(top, { format: function (v) { return v.toLocaleString(); } });
    } else {
      citeBlock = '<p class="subhead">Citations</p>' +
        '<div class="empty-state"><p>No citation data yet. Record an ' +
        '<span class="status quiet">openalexId</span> for each graduate — ' +
        '<strong>node refresh.js --find</strong> proposes them — then ' +
        "<strong>node refresh.js</strong> pulls the numbers.</p></div>";
    }

    host.innerHTML =
      '<div class="tiles">' + tiles.map(function (t) {
        return '<div class="tile"><span class="tile-n">' + esc(t.n) + "</span>" +
          '<span class="tile-l">' + esc(t.l) + "</span></div>";
      }).join("") + "</div>" +

      '<p class="subhead">Graduates per year</p>' +
      '<div class="vbars">' + perYear.map(function (r) {
        return '<div class="vbar' + (r.n ? "" : " zero") + '" data-tip="<strong>' + r.year +
            "</strong><br>" + r.n + " graduate" + (r.n === 1 ? "" : "s") + '">' +
          '<span class="vbar-t"><span class="vbar-f" style="height:' +
            (r.n / peak * 100).toFixed(1) + '%"></span></span>' +
          '<span class="vbar-l">' + (r.year % 5 === 0 ? "&rsquo;" + String(r.year).slice(2) : "") + "</span>" +
        "</div>";
      }).join("") + "</div>" +

      '<p class="subhead">Where they are now</p>' +
      (byCountry.length ? bars(byCountry)
        : '<div class="empty-state"><p>No coordinates yet — run <strong>node refresh.js --geo</strong>.</p></div>') +

      citeBlock;

    var cc = document.getElementById("citecurve");
    if (cc) renderCitationCurve(cc);

    bindTips(host);
  }

  /* ---- tabs ---- */

  /* opts.external: the public version. Year, name and current post only,
     no notes about missing data, and the summary figures sit above the map
     instead of a separate Stats tab with individual comparisons. */
  function renderAlumniTabs(tabsId, bodyId, opts) {
    var tabs = document.getElementById(tabsId);
    var body = document.getElementById(bodyId);
    if (!tabs || !body) return;
    var ext = opts && opts.external;

    var views = ext ? [
      { id: "list", label: "List", render: function (h) { renderAlumniList(h, opts); } },
      { id: "map",  label: "Map",  render: function (h) { renderAlumniMap(h, opts); } }
    ] : [
      { id: "list",  label: "List",  render: renderAlumniList },
      { id: "map",   label: "Map",   render: renderAlumniMap },
      { id: "stats", label: "Stats", render: renderAlumniStats }
    ];

    function show(id, push) {
      var v = views.filter(function (x) { return x.id === id; })[0] || views[0];
      body.innerHTML = "";
      v.render(body);
      Array.prototype.forEach.call(tabs.querySelectorAll("button"), function (b) {
        b.setAttribute("aria-selected", String(b.dataset.id === v.id));
      });
      if (push) { try { history.replaceState(null, "", "#" + v.id); } catch (e) {} }
    }

    tabs.innerHTML = views.map(function (v) {
      return '<button type="button" role="tab" data-id="' + v.id + '" aria-selected="false">' +
        esc(v.label) + "</button>";
    }).join("");

    tabs.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (b) show(b.dataset.id, true);
    });

    show((location.hash || "").slice(1) || "list", false);
  }

  function renderIntro(id) {
    var host = document.getElementById(id);
    if (!host || !window.PROGRAM) return;
    host.innerHTML = window.PROGRAM.intro.map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("") +
      '<p class="lede">' + esc(window.PROGRAM.interests) + "</p>";
  }

  function renderContacts(id) {
    var host = document.getElementById(id);
    if (!host || !window.PROGRAM) return;
    host.innerHTML = '<div class="tbl-wrap"><table class="tbl"><tbody>' +
      window.PROGRAM.contacts.map(function (c) {
        return "<tr><td>" + esc(c.label) + "</td><td>" + (c.href ? link(c.href, c.value) : esc(c.value)) + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }

  function banner(id, on, text) {
    var host = document.getElementById(id);
    if (!host) return;
    if (!on) { host.remove(); return; }
    host.className = "callout";
    host.innerHTML = text;
  }

  /* Frozen banner. Once the full masthead has scrolled out of view, a slim
     copy (crest, title, nav) is pinned to the top of the window. It is a
     separate element, so the page never jumps. Pinned controls further down
     (.sticky-bar, .sticky-tabs) sit just below it via --topbar-h. */
  function initTopbar() {
    var head = document.querySelector(".masthead");
    if (!head || !window.IntersectionObserver) return;
    var crest = head.querySelector(".crest");
    var title = head.querySelector("h1");
    var nav = head.querySelector(".nav");
    var bar = document.createElement("div");
    bar.className = "topbar";
    bar.setAttribute("aria-hidden", "true");
    bar.innerHTML = '<div class="topbar-in">' +
      (crest ? '<img class="topbar-crest" src="' + crest.getAttribute("src") + '" alt="">' : "<span></span>") +
      '<div class="topbar-main"><span class="topbar-title">' + (title ? title.textContent : "") + "</span>" +
      (nav ? '<nav class="nav topbar-nav">' + nav.innerHTML + "</nav>" : "") + "</div></div>";
    Array.prototype.forEach.call(bar.querySelectorAll("a"), function (a) { a.tabIndex = -1; });
    document.body.appendChild(bar);
    var root = document.documentElement;
    new IntersectionObserver(function (es) {
      var show = !es[0].isIntersecting && es[0].boundingClientRect.top < 0;
      bar.classList.toggle("on", show);
      /* Tuck the pinned controls a pixel under the bar: no sub-pixel gap. */
      root.style.setProperty("--topbar-h", show ? Math.floor(bar.getBoundingClientRect().height) - 1 + "px" : "0px");
    }, { threshold: 0 }).observe(nav || head);
  }

  function markNav() {
    var here = location.pathname.split("/").pop() || "index.html";
    Array.prototype.forEach.call(document.querySelectorAll(".nav a"), function (a) {
      if (a.getAttribute("href") === here) a.setAttribute("aria-current", "page");
    });
  }

  /* ======================================================================
     3. BOOT
     ====================================================================== */

  function initTheme() {
    var root = document.documentElement;
    var btn = document.getElementById("theme-toggle");
    if (!btn) return;
    function current() {
      var set = root.getAttribute("data-theme");
      return (set === "dark" || set === "light") ? set : "light";
    }
    function label() {
      btn.setAttribute("aria-label", current() === "dark" ? "Switch to light theme" : "Switch to dark theme");
    }
    btn.addEventListener("click", function () {
      var next = current() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("theme", next); } catch (e) {}
      label();
    });
    label();
  }

  window.SITE = {
    renderFlow: renderFlow,
    renderCards: renderCards,
    renderCalendar: renderCalendar,
    renderCourses: renderCourses,
    renderCourseStats: renderCourseStats,
    renderReading: renderReading,
    renderFaculty: renderFaculty,
    renderMilestoneDefs: renderMilestoneDefs,
    renderPeriods: renderPeriods,
    renderSnapshot: renderSnapshot,
    renderAlumniTabs: renderAlumniTabs,
    renderIntro: renderIntro,
    renderContacts: renderContacts,
    banner: banner
  };

  document.addEventListener("DOMContentLoaded", function () {
    initTheme();
    markNav();
    initTopbar();
    if (typeof window.PAGE === "function") window.PAGE(window.SITE);
  });
})();
