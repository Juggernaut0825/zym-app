import './globals.css';

export const metadata = {
  title: 'ZYM Community Coach',
  description: 'Lifestyle fitness coaching with AI personas and social accountability.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <script
          // Load Figma capture script only when an explicit figmacapture hash is present.
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  if (!window.location.hash || !window.location.hash.includes('figmacapture=')) return;
                  var s = document.createElement('script');
                  s.src = 'https://mcp.figma.com/mcp/html-to-design/capture.js';
                  s.async = true;
                  document.head.appendChild(s);
                } catch (_) {}
              })();
            `,
          }}
        />
        {children}
      </body>
    </html>
  );
}
