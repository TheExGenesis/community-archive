"""HTML entity spelling must not reject an otherwise exact source quote."""
import unittest
from labels import evidence_matches, validate_label


class EvidenceEntityTests(unittest.TestCase):
    def test_encoded_source_and_visible_quote_are_equivalent(self):
        for evidence, text in [('> 400 sqft', 'sublet for &gt; 400 sqft'),
                ('A & B', 'A &amp; B'), ('"yes"', 'said &#34;yes&#34;'),
                ('&gt; 400 sqft', 'sublet for > 400 sqft')]:
            with self.subTest(evidence=evidence):
                self.assertTrue(evidence_matches(evidence,text))

    def test_paraphrase_spacing_case_and_double_decoding_still_fail(self):
        for evidence, text in [('over 400 sqft', '&gt; 400 sqft'),
                ('>  400 sqft', '&gt; 400 sqft'), ('ALL CLAIMED', 'all claimed'),
                ('> 400 sqft', '&amp;gt; 400 sqft')]:
            with self.subTest(evidence=evidence):
                self.assertFalse(evidence_matches(evidence,text))

    def test_real_sublet_label_keeps_source_and_evidence_unchanged(self):
        text='does anyone in SF i know have sublet industrial for &gt; 400 sqft or so? friend is asking'
        label=dict(is_notice=True,side='ask',kind='help',summary='Seeking a sublet.',
            topics=[],respond='unknown',standing=False,expires_at=None,place='SF',
            evidence='sublet industrial for > 400 sqft')
        self.assertEqual(validate_label(label,{'text':text})['evidence'],label['evidence'])
        self.assertIn('&gt;',text)


if __name__=='__main__':unittest.main()
