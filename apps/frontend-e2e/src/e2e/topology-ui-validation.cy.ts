describe("topology UI integration validation", () => {
  function visitTopology(width = 1280, height = 800): void {
    cy.viewport(width, height);
    cy.visit("/topology?e2e=1");
    cy.get(".topology-graph", { timeout: 15000 }).scrollIntoView();
    cy.get(".topology-graph svg", { timeout: 15000 }).should("exist");
    cy.get(".node-ring-legend__button", { timeout: 10000 }).should(
      "have.length",
      3
    );
  }

  function viewportTransform() {
    return cy
      .get(".topology-graph svg g.viewport")
      .should("exist")
      .then(($viewport) => $viewport[0].getAttribute("transform") || "");
  }

  function openTab(
    label: "Force Network" | "Most Active Services" | "Snapshot Fidelity"
  ) {
    cy.contains('[role="tab"]', label).scrollIntoView();
    cy.contains('[role="tab"]', label).click();
  }

  it("renders provenance controls and updates the graph state immediately", () => {
    visitTopology();

    cy.contains(".node-ring-legend__button", "Live")
      .should("have.attr", "aria-pressed", "true")
      .and("be.visible");
    cy.contains(".node-ring-legend__button", "Admin")
      .should("have.attr", "aria-pressed", "true")
      .and("be.visible");
    cy.contains(".node-ring-legend__button", "Derived")
      .should("have.attr", "aria-pressed", "true")
      .and("be.visible");
    cy.contains(".node-ring-legend__status", "All visible").should(
      "be.visible"
    );
    cy.contains(".node-ring-legend__button", "Live").should(
      "have.attr",
      "aria-label",
      "Hide Live links in the force network"
    );
    cy.get(
      '.graph-tools__button[aria-label="Zoom in to the force network"]'
    ).should("be.visible");

    cy.contains(".node-ring-legend__button", "Derived").click();
    cy.get(".node-ring-legend__status").should(
      "not.contain.text",
      "All visible"
    );
    cy.contains(
      ".node-ring-legend__helper",
      "Showing Live + Admin links. Turning the last active filter off restores the full graph."
    ).should("be.visible");
    cy.contains(".graph-filter-note", "full topology snapshot").should(
      "be.visible"
    );
  });

  it("toggles Live on and off and updates the visible filter state", () => {
    visitTopology();

    cy.contains(".node-ring-legend__button", "Live").click();
    cy.contains(".node-ring-legend__button", "Live").should(
      "have.attr",
      "aria-pressed",
      "false"
    );
    cy.get(".node-ring-legend__status").should("contain.text", "Filtered:");

    cy.contains(".node-ring-legend__button", "Live").click();
    cy.contains(".node-ring-legend__button", "Live").should(
      "have.attr",
      "aria-pressed",
      "true"
    );
    cy.contains(".node-ring-legend__status", "All visible").should(
      "be.visible"
    );
  });

  it("toggles Derived on and off and updates the visible filter state", () => {
    visitTopology();

    cy.contains(".node-ring-legend__button", "Derived").click();
    cy.contains(".node-ring-legend__button", "Derived").should(
      "have.attr",
      "aria-pressed",
      "false"
    );
    cy.get(".node-ring-legend__status").should("contain.text", "Filtered:");

    cy.contains(".node-ring-legend__button", "Derived").click();
    cy.contains(".node-ring-legend__button", "Derived").should(
      "have.attr",
      "aria-pressed",
      "true"
    );
    cy.contains(".node-ring-legend__status", "All visible").should(
      "be.visible"
    );
  });

  it("supports two-filter combinations", () => {
    visitTopology();

    cy.contains(".node-ring-legend__button", "Derived").click();
    cy.get(".node-ring-legend__status").should("contain.text", "Live + Admin");

    cy.contains(".node-ring-legend__button", "Admin").click();
    cy.get(".node-ring-legend__status").should("contain.text", "Live");
  });

  it("resets to all when the last active filter is turned off", () => {
    visitTopology();

    cy.contains(".node-ring-legend__button", "Admin").click();
    cy.contains(".node-ring-legend__button", "Derived").click();
    cy.get(".node-ring-legend__status").should("contain.text", "Live");

    cy.contains(".node-ring-legend__button", "Live").click();
    cy.contains(".node-ring-legend__status", "All visible").should(
      "be.visible"
    );
    cy.contains(".node-ring-legend__button", "Live").should(
      "have.attr",
      "aria-pressed",
      "true"
    );
    cy.contains(".node-ring-legend__button", "Admin").should(
      "have.attr",
      "aria-pressed",
      "true"
    );
    cy.contains(".node-ring-legend__button", "Derived").should(
      "have.attr",
      "aria-pressed",
      "true"
    );
  });

  it("preserves filter state across topology refresh", () => {
    visitTopology();

    cy.contains(".node-ring-legend__button", "Derived").click();
    cy.get(".node-ring-legend__status").should("contain.text", "Live + Admin");

    cy.contains("button", "Refresh").click();
    cy.get(".topology-graph svg", { timeout: 15000 }).should("exist");
    cy.get(".node-ring-legend__status").should("contain.text", "Live + Admin");
  });

  it("keeps node rings, node labels, and source styling visible on the rendered graph", () => {
    visitTopology();

    cy.get(".topology-graph svg circle.node-ring").should(
      "have.length.greaterThan",
      0
    );
    cy.get(".topology-graph svg text.node-activity").should(
      "have.length.greaterThan",
      0
    );
    cy.get(".topology-graph svg line[data-key]").should(
      "have.length.greaterThan",
      0
    );
    cy.get(".topology-graph svg line[data-source]").should(
      "have.length.greaterThan",
      0
    );
    cy.get(
      ".topology-graph svg g.viewport g.flow-particles .flow-particle"
    ).should("have.length.greaterThan", 0);
  });

  it("supports focus and keyboard activation on provenance controls", () => {
    visitTopology();

    cy.contains(".node-ring-legend__button", "Admin").focus();
    cy.contains(".node-ring-legend__button", "Admin").should("have.focus");
    cy.contains(".node-ring-legend__button", "Admin").type("{enter}");
    cy.contains(".node-ring-legend__button", "Admin").should(
      "have.attr",
      "aria-pressed",
      "false"
    );

    cy.contains(".node-ring-legend__button", "Admin").focus();
    cy.contains(".node-ring-legend__button", "Admin").type(" ");
    cy.contains(".node-ring-legend__button", "Admin").should(
      "have.attr",
      "aria-pressed",
      "true"
    );
  });

  it("remains usable on desktop, mobile, and after resize", () => {
    visitTopology(1280, 800);

    cy.get(".node-ring-legend").should("be.visible");
    cy.get(".graph-tools").should("be.visible");
    cy.get(".topology-graph")
      .should("be.visible")
      .then(($graph) => {
        const graphRect = $graph[0].getBoundingClientRect();
        expect(graphRect.width).to.be.greaterThan(0);
        expect(graphRect.height).to.be.greaterThan(0);
      });

    cy.viewport(390, 844);
    cy.get(".topology-graph").scrollIntoView();
    cy.get(".node-ring-legend").should("be.visible");
    cy.get(".graph-tools").should("be.visible");
    cy.get(".topology-graph svg").should("exist");

    cy.viewport(900, 600);
    cy.get(".topology-graph").scrollIntoView();
    cy.get(".topology-graph svg").should("exist");
  });

  it("keeps the rest of the topology page usable while filters are active", () => {
    visitTopology();

    cy.contains(".node-ring-legend__button", "Derived").click();
    cy.get(".node-ring-legend__status").should("contain.text", "Live + Admin");

    openTab("Most Active Services");
    cy.contains("h2", "Most Active Services").should("be.visible");
    cy.contains(".graph-filter-note", "full topology snapshot").should(
      "be.visible"
    );

    openTab("Snapshot Fidelity");
    cy.contains("h2", "Snapshot fidelity").should("be.visible");
    cy.contains("h2", "Coverage focus").should("be.visible");
    cy.get(".fidelity-card__stats").should("be.visible");
    cy.contains(".fidelity-stat", "Total links").should("be.visible");
    cy.contains(".fidelity-stat", "Measured coverage").should("be.visible");
    cy.contains(".fidelity-stat", "Derived coverage").should("be.visible");
    cy.contains(".fidelity-stat", "Confidence band").should("be.visible");

    openTab("Force Network");
    cy.get(".topology-graph svg").should("exist");
    cy.get(".node-ring-legend__status").should("contain.text", "Live + Admin");
  });

  it("supports zoom in, zoom out, and fit on the graph viewport", () => {
    visitTopology();

    viewportTransform().then((initialTransform) => {
      cy.contains(".graph-tools__button", "+").click();
      viewportTransform().then((zoomedInTransform) => {
        expect(zoomedInTransform).to.match(/scale\(/);
        expect(zoomedInTransform).to.not.equal(initialTransform);

        cy.contains(".graph-tools__button", "-").click();
        viewportTransform().then((zoomedOutTransform) => {
          expect(zoomedOutTransform).to.match(/scale\(/);
          expect(zoomedOutTransform).to.not.equal(zoomedInTransform);

          cy.contains(".graph-tools__button--reset", "Fit").click();
          viewportTransform().then((fitTransform) => {
            expect(fitTransform).to.match(/scale\(/);
          });
        });
      });
    });
  });
});
