/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  tutorialSidebar: [
    'intro',
    'current-architecture',
    'why-streamjsonrpc',
    {
      type: 'category',
      label: 'Migration Steps',
      collapsed: false,
      items: [
        'step-1-packages',
        'step-2-contracts',
        'step-3-transport-factory',
        'step-4-server',
        'step-5-client',
        'step-6-events-push',
        'step-7-security',
        'step-8-testing',
        'step-9-rollout',
      ],
    },
    'troubleshooting',
    'references',
  ],
};

export default sidebars;
