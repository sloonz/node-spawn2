# Poor man's godoc
$verbatim=0;
while(<>) {
	s/export\s+//;
	if(m|///\s*\@doc-ignore|) {}
	elsif(m|///\s*\@doc-start-code|) { print "<pre><code>\n";$verbatim=1; }
	elsif(m|///\s*\@doc-end-code|) { print "</code></pre>\n";$verbatim=0; }
	elsif(m|/// ?(.*)$|) { print "$1\n" }
	elsif($verbatim==1) { print }
}
