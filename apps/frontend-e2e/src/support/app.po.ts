// Accept h1 or h2 headings (landing page uses <h2>Welcome</h2>)
export const getGreeting = () => cy.get('h1, h2');
