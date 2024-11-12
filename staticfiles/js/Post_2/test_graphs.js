function test(test_data) {

	// setup params
	var margin_ = {top: 30, right: 60, bottom: 30, left: 20},
	width_ = 300
	height_ = 700



	// Add svg
	var line_graph = d3.select("#my_dataviz_test")
	.append("svg")
	  .attr("width", width_ + 100)
	  .attr("height", height_)
	.append("g")
	  .attr("transform",
	        "translate(" + margin_.left + "," + margin_.top + ")");


	d3.csv(test_data, 

		function(d){
		return { output_time_ref: d.output_time_ref = +d.output_time_ref,
		         output_time: d3.timeParse("%d/%m/%Y %H:%M")(d.output_time),
		         prediction: d.prediction = +d.prediction,
				}
		},

		function(data) {

		  // Add x axis
		  var x_test = d3.scaleLinear()
		    .domain([0, d3.max(data, function(d) { return +d.prediction; })])
		    .range([ 0, width_ ]);
		  line_graph.append("g")
		    .attr("transform", "translate(" + 0 + "," + height_ + ")")
		    .call(d3.axisBottom(x_test).tickSizeOuter(0).tickSizeInner(0).ticks(2))
		    .select(".domain").remove();

		  // Add Y axis
		  var y_test = d3.scaleLinear()
		    .domain([0, d3.max(data, function(d) { return +d.output_time_ref; })])
		    .range([ height_, 0 ]);
		  line_graph.append("g")
		    .call(d3.axisLeft(y_test).tickSizeOuter(0).tickSizeInner(0).ticks(5))
		    .select(".domain").remove();

		  // Add the line
		  path_test = line_graph.append("path") 
		    .datum(data)
		    .attr("fill", "none")
		    .attr("fill", "steelblue")
		    .attr("fill-opacity", 0.2)
		    .attr("stroke", "steelblue")
		    .attr("stroke-width", 1)
		    .attr("d", d3.line()
		      .curve(d3.curveBasis)
		      .x(function(d) { return x_test(d.prediction) })
		      .y(function(d) { return y_test(d.output_time_ref) })
		      )


     var mouseG2 = line_graph
        .append("g")
        .attr("class", "mouse-over-effects");

      mouseG2
        .append("path")
        .attr("class", "mouse-line2")
        .style("stroke", "#393B45") 
        .style("stroke-width", "0.5px")
        .style("opacity", 0.75)


      mouseG2.append("text")
        .attr("class", "mouse-text2")

      var totalLength2 = path_test.node().getTotalLength();


      var mousePerLine2 = mouseG2.selectAll('.mouse-per-line2')
        .data(data)
        .enter()
        .append("g")
        .attr("class", "mouse-per-line2");

      mousePerLine2.append("circle")
        .attr("r", 8)
        .style("stroke", 'red')
        .style("fill", "none")
        .style("stroke-width", "2px")
        .style("opacity", "0");



        mouseG2
          .append('svg:rect') 
          .attr('width', width_) 
          .attr('height', height_) 
          .attr('fill', 'none')
          // .attr('opacity', 0.2)
          .attr('pointer-events', 'all')
        .on('mouseout', function() {
          d3.select("#my_dataviz_test")
            .selectAll(".mouse-per-line2 circle")
            .style("opacity", "0"); })


      var mouseover = function(d) {
        d3.select("#my_dataviz_test")
            .select(".mouse-line2")
            .style("opacity", "1")
            .select(".mouse-text2")
            .style("opacity", "1")
            .select(".mouse-per-line2 circle")
            .style("opacity", "1");


          /////////////////////////////////////////////////// 
          d3.select("#my_dataviz_test")
          var mouse2 = d3.mouse(this);

           d3.select("#my_dataviz_test")
            .select(".mouse-text2")
            .attr("y", mouse2[1])
            .attr("transform", "translate(" + (mouse2[1]+60) + "," + (mouse2[1]+5) + ") rotate(90)")

          d3.select("#my_dataviz_test")
            .select(".mouse-line2")
            .attr("d", function() {
              var d = "M" + width_ + "," + mouse2[1];
              d += " " + 0 + "," + mouse2[1];
              return d;
            })

          d3.select("#my_dataviz_test")
            .selectAll(".mouse-per-line2")
            .attr("transform", function(d, i) {
  
              var beginning2 = 0,
                  end2 = totalLength2
                  target2 = null;

              while (true){

                target2 = Math.floor((beginning2 + end2) / 2);


                var pos2 = path_test.node().getPointAtLength(target2);

                if ((target2 === end2 || target2 === beginning2) && pos2.y !== mouse2[1]) {
                    break;
                }
                if (pos2.y > mouse2[1]) { end2 = target2; }
                else if (pos2.y < mouse2[1]) { beginning2 = target2; }

                else {break}; 
              }


              d3.select("#my_dataviz_test").select('circle')
                .style("opacity", 1)


              return "translate(" + (pos2.x) + "," + mouse2[1] +")";

            });

            /////////////////////////////////////////////////// 

      }
      var mouseleave = function(d) {
        d3.select("#my_dataviz_test")
          .select(".mouse-line2")
          .style("opacity", "0")
        d3.select("#my_dataviz_test")
          .select(".circle")
          .style("opacity", "0")
      }

	line_graph
          .on("mouseover", mouseover)
          .on("mouseleave", mouseleave)


})

}





