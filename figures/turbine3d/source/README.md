# NREL 5 MW source data

Input files from the OpenFAST regression test repository, used unmodified.

- Upstream: https://github.com/OpenFAST/r-test
- Paths: `glue-codes/openfast/5MW_Baseline` and `glue-codes/openfast/5MW_OC3Mnpl_DLL_WTurb_WavesIrr`
- Licence: Apache-2.0

The files were renamed when downloaded, to `blade.dat`, `elastodyn.dat`, `aerodyn.dat`, `subdyn.dat`, `seastate.dat` and `airfoils/*_coords.txt`. `figures/turbine3d/build.mjs` reads them and writes `staticfiles/js/turbine3d/published.js`.
