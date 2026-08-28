-- Extend the playoff bracket to top-8 (quarterfinals).
alter type playoff_round add value if not exists 'qf1' before 'sf1';
alter type playoff_round add value if not exists 'qf2' before 'sf1';
alter type playoff_round add value if not exists 'qf3' before 'sf1';
alter type playoff_round add value if not exists 'qf4' before 'sf1';
