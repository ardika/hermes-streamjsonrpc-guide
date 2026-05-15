// @ts-check
import { themes as prismThemes } from 'prism-react-renderer';

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Hermes IPC Migration Guide',
  tagline: 'StreamJsonRpc over per-OS transport (Named Pipe / Unix Domain Socket)',
  favicon: 'img/favicon.ico',

  url: 'https://ardika.github.io',
  baseUrl: '/hermes-streamjsonrpc-guide/',

  organizationName: 'ardika',
  projectName: 'hermes-streamjsonrpc-guide',
  trailingSlash: false,

  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: './sidebars.js',
          routeBasePath: '/',
          editUrl:
            'https://github.com/ardika/hermes-streamjsonrpc-guide/tree/main/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      navbar: {
        title: 'Hermes IPC Migration',
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'tutorialSidebar',
            position: 'left',
            label: 'Guide',
          },
          {
            href: 'https://github.com/ardika/hermes-streamjsonrpc-guide',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Guide',
            items: [
              { label: 'Introduction', to: '/' },
              { label: 'Migration Steps', to: '/step-1-packages' },
            ],
          },
          {
            title: 'References',
            items: [
              { label: 'StreamJsonRpc', href: 'https://github.com/microsoft/vs-streamjsonrpc' },
              { label: 'JSON-RPC 2.0 Spec', href: 'https://www.jsonrpc.org/specification' },
            ],
          },
          {
            title: 'Source',
            items: [
              { label: 'GitHub', href: 'https://github.com/ardika/hermes-streamjsonrpc-guide' },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} Hermes IPC Migration Guide.`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
        additionalLanguages: ['csharp', 'bash', 'powershell', 'json'],
      },
      colorMode: {
        defaultMode: 'dark',
        respectPrefersColorScheme: true,
      },
    }),
};

export default config;
